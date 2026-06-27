let audioCtx: AudioContext | null = null;
let currentSource: AudioBufferSourceNode | null = null;

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

function stopCurrentSource(): void {
  if (currentSource) {
    currentSource.onended = null;
    try {
      currentSource.stop();
    } catch {
      /* already stopped */
    }
    currentSource = null;
  }
}

export function stopSpeaking(): void {
  stopCurrentSource();
}

async function speakWithGemini(
  text: string,
  personaId: string,
  cancelled: () => boolean
): Promise<void> {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, personaId }),
  });

  if (cancelled()) return;

  if (!res.ok) {
    const msg = await res.text().catch(() => "TTS request failed");
    throw new Error(msg.slice(0, 200));
  }

  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  if (cancelled()) return;

  const arrayBuffer = await res.arrayBuffer();
  if (cancelled()) return;

  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  if (cancelled()) return;

  // Resume once more — the fetch may have outlasted the gesture window on slow connections.
  if (audioCtx.state === "suspended") await audioCtx.resume();

  await new Promise<void>((resolve) => {
    const source = audioCtx!.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioCtx!.destination);
    currentSource = source;

    source.onended = () => {
      if (currentSource === source) currentSource = null;
      resolve();
    };

    try {
      source.start(0);
    } catch {
      currentSource = null;
      resolve();
    }
  });
}

/**
 * Speak text via Gemini TTS. Returns a cancel function.
 * onEnd fires when audio finishes. onError fires if Gemini fails (no fallback).
 */
export function speakText(
  text: string,
  personaId: string,
  onEnd?: () => void,
  onError?: (message: string) => void
): () => void {
  if (!text.trim()) {
    onEnd?.();
    return () => {};
  }

  stopSpeaking();

  let cancelled = false;
  const isCancelled = () => cancelled;

  void (async () => {
    try {
      await speakWithGemini(text, personaId, isCancelled);
      if (!cancelled) onEnd?.();
    } catch (err) {
      if (!cancelled) {
        const msg = err instanceof Error ? err.message : "Could not play audio";
        onError?.(msg);
        onEnd?.();
      }
    }
  })();

  return () => {
    cancelled = true;
    stopCurrentSource();
  };
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

export function recognitionLangFromMode(
  mode: "auto" | "cantonese" | "english"
): string {
  if (mode === "cantonese") return "zh-HK";
  if (mode === "english") return "en-US";
  return "zh-HK";
}
