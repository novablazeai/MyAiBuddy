let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

/** Call this synchronously inside a user gesture handler to permanently unlock the AudioContext. */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  if (!audioCtx) audioCtx = new AudioContext();
  // Play a 1-sample silent buffer — this is the only reliable way to unlock
  // AudioContext on Android Chrome. resume() alone is not enough.
  const buffer = audioCtx.createBuffer(1, 1, 22050);
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx.destination);
  source.start(0);
  if (audioCtx.state === "suspended") audioCtx.resume();
}

export function stopSpeaking(): void {
  if (currentSource) {
    currentSource.onended = null;
    try { currentSource.stop(); } catch { /* already stopped */ }
    currentSource = null;
  }
}

export function speakText(
  text: string,
  personaId: string,
  onEnd?: () => void
): () => void {
  stopSpeaking();

  let cancelled = false;
  const cancel = () => {
    cancelled = true;
    stopSpeaking();
  };

  (async () => {
    try {
      if (typeof window === "undefined") { onEnd?.(); return; }
      if (!audioCtx) audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") await audioCtx.resume();

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, personaId }),
      });

      if (!res.ok || cancelled) {
        if (!cancelled) onEnd?.();
        return;
      }

      const arrayBuffer = await res.arrayBuffer();
      if (cancelled) return;

      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      if (cancelled) return;

      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      currentSource = source;

      source.onended = () => {
        currentSource = null;
        if (!cancelled) onEnd?.();
      };

      source.start(0);
    } catch (err) {
      console.error("TTS playback error:", err);
      if (!cancelled) onEnd?.();
    }
  })();

  return cancel;
}

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
