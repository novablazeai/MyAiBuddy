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

// Google Cloud TTS rejects input over 5000 bytes, so we split long replies
// under this (with headroom) and stitch the audio back together. Cloud TTS is
// deterministic per voice, so chunks sound identical — no drift.
const TTS_MAX_BYTES = 4000;

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Split text into <=TTS_MAX_BYTES chunks, preferring sentence boundaries. */
function splitForTts(text: string): string[] {
  if (byteLength(text) <= TTS_MAX_BYTES) return [text];

  const pieces = text.match(/[^。！？.!?\n]*[。！？.!?\n]+|[^。！？.!?\n]+/g) ?? [
    text,
  ];
  const chunks: string[] = [];
  let buf = "";

  const hardSplit = (s: string) => {
    let piece = "";
    for (const ch of s) {
      if (piece && byteLength(piece + ch) > TTS_MAX_BYTES) {
        chunks.push(piece);
        piece = "";
      }
      piece += ch;
    }
    if (piece) buf = piece;
  };

  for (const s of pieces) {
    if (buf && byteLength(buf + s) > TTS_MAX_BYTES) {
      chunks.push(buf);
      buf = "";
    }
    if (byteLength(s) > TTS_MAX_BYTES) {
      if (buf) {
        chunks.push(buf);
        buf = "";
      }
      hardSplit(s);
    } else {
      buf += s;
    }
  }
  if (buf) chunks.push(buf);
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

/** Fetch + decode one text chunk into an AudioBuffer. */
async function synthesizeOne(
  chunk: string,
  personaId: string,
  cancelled: () => boolean
): Promise<AudioBuffer | null> {
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

  if (!res.ok) {
    const msg = await res.text().catch(() => "TTS request failed");
    throw new Error(msg.slice(0, 200));
  }

  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  if (cancelled()) return null;

  const arrayBuffer = await res.arrayBuffer();
  if (cancelled()) return null;

  return audioCtx.decodeAudioData(arrayBuffer);
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
  const results = await Promise.all(
    chunks.map((chunk) => synthesizeOne(chunk, personaId, cancelled))
  );
  if (cancelled()) return null;

  const buffers = results.filter((b): b is AudioBuffer => b !== null);
  if (buffers.length === 0) return null;
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
