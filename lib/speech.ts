export type SpeechLang = "zh-HK" | "en-US";

const CANTONESE_PATTERN = /[\u4e00-\u9fff\u3400-\u4dbf]/;

let currentAudio: HTMLAudioElement | null = null;
let voicesReady = false;
/** Skip Gemini for this session after quota/auth errors so replay isn't stuck waiting. */
let skipGeminiTts = false;

export function detectSpeechLang(text: string): SpeechLang {
  const chinese = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) ?? []).length;
  const latin = (text.match(/[a-zA-Z]/g) ?? []).length;
  if (chinese >= latin) return "zh-HK";
  return "en-US";
}

export interface SpeechSegment {
  lang: SpeechLang;
  text: string;
}

export function splitSpeechSegments(text: string): SpeechSegment[] {
  const segments: SpeechSegment[] = [];
  let current = "";
  let currentLang: SpeechLang | null = null;

  for (const char of text) {
    const isChinese = CANTONESE_PATTERN.test(char);
    const isLatin = /[a-zA-Z]/.test(char);
    const lang: SpeechLang | null = isChinese
      ? "zh-HK"
      : isLatin
        ? "en-US"
        : currentLang;

    if (lang && currentLang && lang !== currentLang && current.trim()) {
      segments.push({ lang: currentLang, text: current.trim() });
      current = char;
      currentLang = lang;
    } else {
      current += char;
      if (lang) currentLang = lang;
    }
  }

  if (current.trim()) {
    segments.push({
      lang: currentLang ?? detectSpeechLang(text),
      text: current.trim(),
    });
  }

  return segments.length > 0
    ? segments
    : [{ lang: detectSpeechLang(text), text: text.trim() }];
}

function pickVoice(
  voices: SpeechSynthesisVoice[],
  lang: SpeechLang,
  personaId: string
): SpeechSynthesisVoice | undefined {
  const preferMale = personaId === "adrian";
  const langPrefix = lang === "zh-HK" ? "zh" : "en";

  const langVoices = voices.filter((v) =>
    v.lang.toLowerCase().startsWith(langPrefix)
  );

  const hkVoices =
    lang === "zh-HK"
      ? langVoices.filter((v) => {
          const l = v.lang.toLowerCase();
          return l.includes("hk") || l.includes("yue") || l.includes("hant");
        })
      : [];

  const pool = hkVoices.length > 0 ? hkVoices : langVoices;

  const scoreVoice = (v: SpeechSynthesisVoice) => {
    const name = v.name.toLowerCase();
    let score = 0;
    if (lang === "zh-HK" && v.lang.toLowerCase().includes("hk")) score += 10;
    if (preferMale && /daniel|aaron|gordon|male|lee|ting/.test(name)) score += 5;
    if (!preferMale && /samantha|karen|moira|female|mei|sin-ji|flo/.test(name))
      score += 5;
    if (v.default) score += 1;
    return score;
  };

  return [...pool].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] ?? voices[0];
}

/** Call inside a user click/tap so the browser allows audio playback. */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;

  if (window.speechSynthesis) {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) voicesReady = true;
    window.speechSynthesis.resume();
  }

  // Prime HTMLAudio so later async play() works after Gemini fetch.
  try {
    const silent = new Audio(
      "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA=="
    );
    silent.volume = 0.01;
    void silent.play().then(() => silent.pause()).catch(() => {});
  } catch {
    /* ignore */
  }
}

function waitForVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve([]);
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      voicesReady = true;
      resolve(voices);
      return;
    }

    const onVoicesChanged = () => {
      const loaded = window.speechSynthesis.getVoices();
      if (loaded.length > 0) {
        voicesReady = true;
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
        resolve(loaded);
      }
    };

    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      resolve(window.speechSynthesis.getVoices());
    }, 500);
  });
}

function stopHtmlAudio(): void {
  if (currentAudio) {
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

export function stopSpeaking(): void {
  stopHtmlAudio();
  if (typeof window !== "undefined" && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

function playBlob(blob: Blob, cancelled: () => boolean): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (cancelled()) {
      resolve(false);
      return;
    }

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve(true);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      reject(new Error("Audio playback failed"));
    };

    audio.play().catch((err) => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      reject(err instanceof Error ? err : new Error("Audio play blocked"));
    });
  });
}

function speakWithBrowser(
  text: string,
  personaId: string,
  cancelled: () => boolean,
  onEnd?: () => void,
  onError?: (message: string) => void
): void {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onError?.("Speech synthesis not available in this browser");
    onEnd?.();
    return;
  }

  window.speechSynthesis.cancel();

  const segments = splitSpeechSegments(text);
  let index = 0;
  let hadError = false;

  const speakNext = (voices: SpeechSynthesisVoice[]) => {
    if (cancelled() || index >= segments.length) {
      if (hadError && index === 0) {
        onError?.("Browser voice playback failed. Try Chrome or Safari.");
      }
      onEnd?.();
      return;
    }

    const { lang, text: segmentText } = segments[index];
    index += 1;

    const utterance = new SpeechSynthesisUtterance(segmentText);
    utterance.lang = lang;
    utterance.rate = 0.95;
    utterance.pitch = personaId === "adrian" ? 0.92 : 1.05;

    const voice = pickVoice(voices, lang, personaId);
    if (voice) utterance.voice = voice;

    utterance.onend = () => speakNext(voices);
    utterance.onerror = () => {
      hadError = true;
      speakNext(voices);
    };

    window.speechSynthesis.speak(utterance);
  };

  void (async () => {
    const voices = voicesReady
      ? window.speechSynthesis.getVoices()
      : await waitForVoices();

    // Safari/Chrome: must delay speak slightly after cancel().
    setTimeout(() => {
      if (!cancelled()) speakNext(voices);
    }, 80);
  })();
}

async function speakWithGemini(
  text: string,
  personaId: string,
  cancelled: () => boolean
): Promise<boolean> {
  if (typeof window === "undefined" || skipGeminiTts) return false;

  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, personaId }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "TTS request failed");
    if (res.status === 429 || res.status === 401 || res.status === 403) {
      skipGeminiTts = true;
    }
    throw new Error(
      res.status === 429
        ? "Gemini voice quota exceeded — using browser voice"
        : errText.slice(0, 120)
    );
  }

  if (cancelled()) return false;

  const blob = await res.blob();
  if (cancelled() || blob.size < 100) return false;

  return playBlob(blob, cancelled);
}

/**
 * Speak text: Gemini TTS when available, browser voices as fallback.
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
      if (!skipGeminiTts) {
        const usedGemini = await speakWithGemini(text, personaId, isCancelled);
        if (cancelled) return;
        if (usedGemini) {
          onEnd?.();
          return;
        }
      }
    } catch (err) {
      console.warn("Gemini TTS unavailable:", err);
      if (cancelled) return;
    }

    speakWithBrowser(text, personaId, isCancelled, onEnd, onError);
  })();

  return () => {
    cancelled = true;
    stopSpeaking();
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
