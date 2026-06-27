import { NextRequest } from "next/server";
import { GoogleGenAI } from "@google/genai";

// Adrian: Charon — confident, clear male
// Martha: Aoede — warm, expressive female
const PERSONA_VOICES: Record<string, string> = {
  adrian: "Charon",
  martha: "Aoede",
};

/** Wrap raw L16 PCM bytes in a WAV container so browsers can play it. */
function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitDepth = 16): Buffer {
  const dataSize = pcm.length;
  const header = Buffer.allocUnsafe(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);                                    // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28);
  header.writeUInt16LE(channels * (bitDepth / 8), 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcm]);
}

export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return new Response("GEMINI_API_KEY is not configured", { status: 500 });
  }

  const { text, personaId } = await req.json();
  if (!text?.trim()) {
    return new Response("Missing text", { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const voice = PERSONA_VOICES[personaId] ?? "Aoede";

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.[0];
  const b64 = part?.inlineData?.data;
  const mimeType = part?.inlineData?.mimeType ?? "";

  if (!b64) {
    return new Response("No audio returned from Gemini", { status: 500 });
  }

  const pcm = Buffer.from(b64, "base64");
  // Gemini returns audio/L16;rate=24000 — wrap in WAV for browser playback
  const wav = mimeType.includes("L16") ? pcmToWav(pcm) : pcm;
  const contentType = mimeType.includes("L16") ? "audio/wav" : mimeType;

  return new Response(new Uint8Array(wav), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(wav.byteLength),
    },
  });
}
