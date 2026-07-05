import { DEFAULT_VOICE_ID } from "./voices";

let audioCtx: AudioContext | null = null;

/**
 * Call inside a user click/tap. Creates and unlocks the AudioContext so
 * the async Gemini fetch → decode → play chain works without autoplay block.
 */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;

  if (!audioCtx) audioCtx = new AudioContext();

  // Playing a silent 1-sample buffer synchronously in the gesture handler
  // tells the browser to allow future AudioContext.resume() + source.start()
  // even after the async chain (fetch → decodeAudioData → start).
  try {
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0);
  } catch {
    /* ignore */
  }

  if (audioCtx.state === "suspended") void audioCtx.resume();
}

/**
 * Strip roleplay stage directions so they're never read aloud, even if the
 * model slips one in: *actions*, （full-width asides）, and [bracketed] cues.
 */
function cleanForSpeech(text: string): string {
  return text
    .replace(/\*[^*]*\*/g, " ")
    .replace(/（[^）]*）/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Cloud TTS has two limits: the whole request must be <5000 bytes, AND each
// individual sentence (text between . 。 ! ? etc.) must be short — it rejects
// sentences past ~70 chars. So we pack short sentences up to TTS_MAX_BYTES, and
// break any over-long run-on sentence at commas so no single sentence is too
// long. Cloud TTS is deterministic per voice, so the stitched audio has no drift.
const TTS_MAX_BYTES = 4000;
const SENTENCE_MAX_BYTES = 150; // ~50 chars — safely under the ~70-char limit

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Break one over-long sentence at commas, then hard-split anything still huge. */
function splitLongSentence(sentence: string): string[] {
  const clauses = sentence.match(/[^，、；;：,]*[，、；;：,]+|[^，、；;：,]+/g) ?? [
    sentence,
  ];
  const out: string[] = [];
  for (const clause of clauses) {
    if (byteLength(clause) <= SENTENCE_MAX_BYTES) {
      out.push(clause);
      continue;
    }
    let piece = "";
    for (const ch of clause) {
      if (piece && byteLength(piece + ch) > SENTENCE_MAX_BYTES) {
        out.push(piece);
        piece = "";
      }
      piece += ch;
    }
    if (piece) out.push(piece);
  }
  return out;
}

/** Split text into chunks safe for Cloud TTS (byte total + per-sentence length). */
function splitForTts(text: string): string[] {
  const sentences = text.match(
    /[^。！？.!?\n]*[。！？.!?\n]+|[^。！？.!?\n]+/g
  ) ?? [text];
  const chunks: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) {
      chunks.push(buf);
      buf = "";
    }
  };

  for (const s of sentences) {
    // An over-long sentence would be rejected even alone, so fragment it and
    // send each fragment as its own chunk (packing would re-form a long one).
    if (byteLength(s) > SENTENCE_MAX_BYTES) {
      flush();
      for (const frag of splitLongSentence(s)) chunks.push(frag);
      continue;
    }
    if (buf && byteLength(buf + s) > TTS_MAX_BYTES) flush();
    buf += s;
  }
  flush();
  return chunks;
}

/** Join decoded buffers end-to-end into a single AudioBuffer. */
function concatBuffers(buffers: AudioBuffer[]): AudioBuffer {
  if (buffers.length === 1) return buffers[0];
  const ctx = audioCtx!;
  const channels = Math.max(...buffers.map((b) => b.numberOfChannels));
  const length = buffers.reduce((n, b) => n + b.length, 0);
  const out = ctx.createBuffer(channels, length, buffers[0].sampleRate);
  for (let ch = 0; ch < channels; ch += 1) {
    const data = out.getChannelData(ch);
    let offset = 0;
    for (const b of buffers) {
      data.set(b.getChannelData(Math.min(ch, b.numberOfChannels - 1)), offset);
      offset += b.length;
    }
  }
  return out;
}

const TTS_MAX_CONCURRENCY = 4; // avoid bursting Google's per-minute rate limit
const TTS_RETRIES = 3; // survive brief mobile-network blips

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch + decode one text chunk into an AudioBuffer, retrying transient
 * failures. Returns null (skip this chunk) if it never succeeds — one bad
 * chunk should never silence the whole reply.
 */
async function synthesizeOne(
  chunk: string,
  personaId: string,
  cancelled: () => boolean
): Promise<AudioBuffer | null> {
  for (let attempt = 0; attempt <= TTS_RETRIES; attempt += 1) {
    if (cancelled()) return null;
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: chunk,
          personaId,
          voice: getVoicePreference(personaId),
        }),
      });
      if (cancelled()) return null;

      if (res.ok) {
        if (!audioCtx) audioCtx = new AudioContext();
        if (audioCtx.state === "suspended") await audioCtx.resume();
        if (cancelled()) return null;
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled()) return null;
        return await audioCtx.decodeAudioData(arrayBuffer);
      }
      if (attempt === TTS_RETRIES) {
        console.warn("TTS chunk failed after retries:", res.status);
        return null;
      }
    } catch {
      if (attempt === TTS_RETRIES) return null;
    }
    await delay(400 * (attempt + 1)); // backoff before retrying (0.4s, 0.8s, 1.2s)
  }
  return null;
}

/** Synthesize text (chunking long replies) into one playable AudioBuffer. */
async function synthesize(
  text: string,
  personaId: string,
  cancelled: () => boolean
): Promise<AudioBuffer | null> {
  const clean = cleanForSpeech(text);
  if (!clean) return null;

  const chunks = splitForTts(clean);
  const results: (AudioBuffer | null)[] = new Array(chunks.length).fill(null);

  // Synthesize in order but with bounded concurrency (a small worker pool).
  let next = 0;
  const worker = async () => {
    while (!cancelled()) {
      const i = next;
      next += 1;
      if (i >= chunks.length) return;
      results[i] = await synthesizeOne(chunks[i], personaId, cancelled);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(TTS_MAX_CONCURRENCY, chunks.length) }, worker)
  );
  if (cancelled()) return null;

  const buffers = results.filter((b): b is AudioBuffer => b !== null);
  // Only surface an error if we couldn't synthesize ANY of it.
  if (buffers.length === 0) {
    if (chunks.length > 0) throw new Error("Could not play audio");
    return null;
  }
  return concatBuffers(buffers);
}

/* -------------------------------------------------------------------------- */
/*  Stateful audio player: play / pause / resume / seek for one message.       */
/*  Built on Web Audio (AudioBufferSourceNode can't pause, so we stop and      */
/*  restart from a tracked offset), exposed as an external store for React.    */
/* -------------------------------------------------------------------------- */

export type PlayerStatus = "idle" | "loading" | "playing" | "paused";

export interface PlayerState {
  messageId: string | null;
  status: PlayerStatus;
  position: number; // seconds into the current clip
  duration: number; // seconds
  error: string | null;
}

const IDLE: PlayerState = {
  messageId: null,
  status: "idle",
  position: 0,
  duration: 0,
  error: null,
};

// `fullState` changes on every update (incl. position ticks). `statusState`
// only gets a new reference when non-position fields change, so subscribers
// that don't care about the moving playhead can avoid re-rendering ~10x/sec.
let fullState: PlayerState = IDLE;
let statusState: PlayerState = IDLE;

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function setState(patch: Partial<PlayerState>) {
  const next = { ...fullState, ...patch };
  fullState = next;
  if (
    next.messageId !== statusState.messageId ||
    next.status !== statusState.status ||
    next.duration !== statusState.duration ||
    next.error !== statusState.error
  ) {
    statusState = next;
  }
  emit();
}

export function subscribePlayer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Full snapshot including the live playhead position. */
export function getPlayerState(): PlayerState {
  return fullState;
}

/** Snapshot that ignores position-only changes (stable across playhead ticks). */
export function getPlayerStatus(): PlayerState {
  return statusState;
}

// Playback bookkeeping.
let activeBuffer: AudioBuffer | null = null;
let activeMessageId: string | null = null;
let source: AudioBufferSourceNode | null = null;
let startedAt = 0; // audioCtx.currentTime when the current source started
let startOffset = 0; // buffer offset (sec) the current source started from
let ticker: ReturnType<typeof setInterval> | null = null;
let loadToken = 0; // invalidates in-flight synth loads

function livePosition(): number {
  if (!activeBuffer || !audioCtx) return startOffset;
  if (fullState.status === "playing") {
    return Math.min(startOffset + (audioCtx.currentTime - startedAt), activeBuffer.duration);
  }
  return startOffset;
}

function stopTicker() {
  if (ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
}

function stopSource() {
  stopTicker();
  if (source) {
    source.onended = null;
    try {
      source.stop();
    } catch {
      /* already stopped */
    }
    source = null;
  }
}

function startFrom(offset: number) {
  if (!activeBuffer || !audioCtx) return;
  stopSource();

  if (audioCtx.state === "suspended") void audioCtx.resume();

  const src = audioCtx.createBufferSource();
  src.buffer = activeBuffer;
  src.connect(audioCtx.destination);
  src.onended = () => {
    // Only the natural end reaches here (manual stops null out onended first).
    if (source !== src) return;
    stopSource();
    startOffset = 0;
    setState({ status: "idle", position: 0 });
  };

  startOffset = Math.max(0, Math.min(offset, activeBuffer.duration));
  startedAt = audioCtx.currentTime;
  source = src;

  try {
    src.start(0, startOffset);
  } catch {
    source = null;
    return;
  }

  setState({ status: "playing", position: startOffset });
  ticker = setInterval(() => {
    if (fullState.status === "playing") setState({ position: livePosition() });
  }, 100);
}

/** Load (synthesize) a message's audio and start playing from the beginning. */
export async function playMessage(
  text: string,
  personaId: string,
  messageId: string
): Promise<void> {
  unlockAudio();

  // Same clip already loaded — just restart without re-fetching.
  if (activeMessageId === messageId && activeBuffer) {
    startFrom(0);
    return;
  }

  const token = ++loadToken;
  stopSource();
  activeBuffer = null;
  activeMessageId = messageId;
  setState({ messageId, status: "loading", position: 0, duration: 0, error: null });

  try {
    const buffer = await synthesize(text, personaId, () => token !== loadToken);
    if (token !== loadToken) return; // superseded by a newer play/stop
    if (!buffer) {
      setState({ status: "idle" });
      return;
    }
    activeBuffer = buffer;
    setState({ duration: buffer.duration });
    startFrom(0);
  } catch (err) {
    if (token !== loadToken) return;
    activeMessageId = null;
    const message = err instanceof Error ? err.message : "Could not play audio";
    setState({ status: "idle", error: message });
  }
}

export function pausePlayback(): void {
  if (fullState.status !== "playing" || !activeBuffer) return;
  const pos = livePosition();
  stopSource();
  startOffset = pos;
  setState({ status: "paused", position: pos });
}

export function resumePlayback(): void {
  if (fullState.status !== "paused" || !activeBuffer) return;
  startFrom(startOffset);
}

export function togglePlayback(): void {
  if (fullState.status === "playing") pausePlayback();
  else if (fullState.status === "paused") resumePlayback();
}

/** Seek to a position (seconds). Keeps playing if playing, stays paused if paused. */
export function seekPlayback(seconds: number): void {
  if (!activeBuffer) return;
  const clamped = Math.max(0, Math.min(seconds, activeBuffer.duration));
  if (fullState.status === "playing") {
    startFrom(clamped);
  } else {
    startOffset = clamped;
    setState({ status: "paused", position: clamped });
  }
}

/** Fully stop playback and clear the player. */
export function stopPlayback(): void {
  loadToken++; // cancel any in-flight load
  stopSource();
  activeBuffer = null;
  activeMessageId = null;
  startOffset = 0;
  setState({
    messageId: null,
    status: "idle",
    position: 0,
    duration: 0,
    error: null,
  });
}

/* -------------------------------------------------------------------------- */

const VOICE_MODE_KEY = "myaibuddy_voice_mode";

export function getVoiceModePreference(): boolean {
  if (typeof window === "undefined") return true;
  const stored = localStorage.getItem(VOICE_MODE_KEY);
  return stored === null ? true : stored === "true";
}

export function setVoiceModePreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VOICE_MODE_KEY, String(enabled));
}

const voiceKey = (personaId: string) => `myaibuddy_voice_${personaId}`;

export function getVoicePreference(personaId: string): string {
  const fallback = DEFAULT_VOICE_ID[personaId] ?? "Charon";
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(voiceKey(personaId)) ?? fallback;
}

export function setVoicePreference(personaId: string, voiceId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(voiceKey(personaId), voiceId);
}

export function recognitionLangFromMode(
  mode: "auto" | "cantonese" | "english"
): string {
  if (mode === "cantonese") return "zh-HK";
  if (mode === "english") return "en-US";
  return "zh-HK";
}
