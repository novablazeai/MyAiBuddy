import { NextRequest } from "next/server";
import { resolveVoiceId } from "@/lib/voices";

export const runtime = "nodejs";
export const preferredRegion = "hkg1";

// Native Cloud TTS controls (no pitch distortion). Faster + louder so Adrian
// sounds lively rather than slow and quiet.
const SPEAKING_RATE = 1.25;
const VOLUME_GAIN_DB = 6.0;

// Any CJK character means the reply is Cantonese (the chat model is prompted to
// answer in one language), so we pick the Cantonese voice for the whole reply.
function isCantonese(text: string): boolean {
  return /[㐀-鿿豈-﫿]/.test(text);
}

// Chirp3-HD yue-HK mispronounces a few Cantonese-only characters and offers no
// pronunciation-override API, so we swap in homophones for the AUDIO only (the
// on-screen text is never touched). Chosen by ear test. Easy to extend/revert.
const PRONUNCIATION_FIXES: [RegExp, string][] = [
  [/唔/g, "吾"], // 唔 (m4) misread -> 吾 (ng4), which sounds right on this voice
];
function fixPronunciation(text: string): string {
  return PRONUNCIATION_FIXES.reduce((t, [re, sub]) => t.replace(re, sub), text);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GOOGLE_CLOUD_TTS_API_KEY;
  if (!apiKey) {
    return new Response("GOOGLE_CLOUD_TTS_API_KEY is not configured", {
      status: 500,
    });
  }

  try {
    const { text, personaId, voice } = await req.json();
    if (!text?.trim()) {
      return new Response("Missing text", { status: 400 });
    }

    // Same Chirp3-HD voice in both languages; only the locale switches.
    const voiceId = resolveVoiceId(personaId, voice);
    const languageCode = isCantonese(text) ? "yue-HK" : "en-GB";
    const voiceName = `${languageCode}-Chirp3-HD-${voiceId}`;

    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: fixPronunciation(text.trim()) },
          voice: { languageCode, name: voiceName },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: SPEAKING_RATE,
            volumeGainDb: VOLUME_GAIN_DB,
          },
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("Cloud TTS error:", res.status, detail.slice(0, 300));
      return new Response(`TTS failed (${res.status})`, { status: 502 });
    }

    const { audioContent } = (await res.json()) as { audioContent?: string };
    if (!audioContent) {
      return new Response("No audio returned from TTS", { status: 502 });
    }

    const mp3 = Buffer.from(audioContent, "base64");
    return new Response(new Uint8Array(mp3), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(mp3.byteLength),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "TTS request failed";
    console.error("TTS error:", message);
    return new Response(message, { status: 500 });
  }
}
