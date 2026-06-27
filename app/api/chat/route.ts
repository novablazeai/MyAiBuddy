import { NextRequest } from "next/server";
import OpenAI from "openai";
import { buildSystemPrompt } from "@/lib/systemPrompt";
import { getPersona } from "@/lib/personas";

// Run close to the user (Hong Kong) and to DeepSeek's API (China)
export const runtime = "nodejs";
export const preferredRegion = "hkg1";

function getClient() {
  return new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: process.env.DEEPSEEK_API_KEY,
  });
}

export async function POST(req: NextRequest) {
  const { messages, personaId, langMode } = await req.json();

  if (!process.env.DEEPSEEK_API_KEY) {
    return new Response("DEEPSEEK_API_KEY is not configured", { status: 500 });
  }

  const persona = getPersona(personaId);
  const systemPrompt = buildSystemPrompt(persona, langMode);
  const client = getClient();

  const stream = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
    max_tokens: 1024,
    temperature: 0.85,
    stream: true,
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? "";
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
