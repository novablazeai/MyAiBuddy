// Selectable TTS voices per persona. Each id is a Google Cloud Chirp3-HD voice
// name that exists in BOTH yue-HK (Cantonese) and en-GB (English), so the same
// voice carries across languages. See cloud.google.com/text-to-speech/docs/voices.

export interface VoiceOption {
  id: string;
  label: string;
  blurb: string;
}

export const PERSONA_VOICE_OPTIONS: Record<string, VoiceOption[]> = {
  adrian: [
    { id: "Orus", label: "Orus", blurb: "後生、有活力" },
    { id: "Iapetus", label: "Iapetus", blurb: "斯文、平穩" },
    { id: "Enceladus", label: "Enceladus", blurb: "爽朗、清晰" },
    { id: "Puck", label: "Puck", blurb: "活潑、upbeat" },
    { id: "Fenrir", label: "Fenrir", blurb: "低沉、有力" },
    { id: "Charon", label: "Charon", blurb: "沉穩" },
  ],
  martha: [
    { id: "Aoede", label: "Aoede", blurb: "溫暖" },
    { id: "Kore", label: "Kore", blurb: "清亮" },
    { id: "Leda", label: "Leda", blurb: "柔和" },
    { id: "Callirrhoe", label: "Callirrhoe", blurb: "優雅" },
  ],
};

export const DEFAULT_VOICE_ID: Record<string, string> = {
  adrian: "Orus",
  martha: "Aoede",
};

/** Validate a requested voice against the persona's allowlist; fall back safely. */
export function resolveVoiceId(
  personaId: string,
  voiceId: string | undefined
): string {
  const options = PERSONA_VOICE_OPTIONS[personaId] ?? PERSONA_VOICE_OPTIONS.adrian;
  const fallback = DEFAULT_VOICE_ID[personaId] ?? "Charon";
  if (voiceId && options.some((o) => o.id === voiceId)) return voiceId;
  return fallback;
}
