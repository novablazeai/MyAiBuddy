import { NextRequest } from "next/server";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { buildSystemPrompt } from "@/lib/systemPrompt";
import { getPersona } from "@/lib/personas";

export const runtime = "nodejs";
export const preferredRegion = "hkg1";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const { messages, personaId, langMode } = await req.json();

  if (!process.env.GEMINI_API_KEY) {
    return new Response("GEMINI_API_KEY is not configured", { status: 500 });
  }

  const persona = getPersona(personaId);
  const systemPrompt = buildSystemPrompt(persona, langMode);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Convert OpenAI-style history to Gemini "contents" (assistant -> model).
  const contents = (messages as ChatMessage[]).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const stream = await ai.models.generateContentStream({
    model: "gemini-3.5-flash",
    contents,
    config: {
      systemInstruction: systemPrompt,
      // Gemini 3 recommends keeping temperature at 1.0; lowering it with
      // a thinking model can cause looping/degraded output.
      temperature: 1.0,
      maxOutputTokens: 2048,
      // Thinking runs before the first output token, so it directly adds to
      // time-to-first-word. MINIMAL keeps the buddy snappy (~1.8s vs ~4.9s
      // for HIGH). Bump to LOW/MEDIUM if answers feel too shallow.
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
    },
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.text ?? "";
          if (text) controller.enqueue(encoder.encode(text));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Prevent proxy/CDN buffering so tokens stream through immediately
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
