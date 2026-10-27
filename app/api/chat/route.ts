import { NextRequest } from "next/server";
import {
  GoogleGenAI,
  PartMediaResolutionLevel,
  ThinkingLevel,
  createPartFromBase64,
  type Part,
} from "@google/genai";
import { buildSystemPrompt } from "@/lib/systemPrompt";
import { getPersona } from "@/lib/personas";

export const runtime = "nodejs";
export const preferredRegion = "hkg1";

type ChatMessage = { role: "user" | "assistant"; content: string };
type IncomingImage = { data: string; mimeType: string };

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
// Base64 length cap (~3 MB of image). The browser resizes to ~1280px first,
// so real photos come in far below this; it also keeps us under Vercel's
// request size limit.
const MAX_IMAGE_BASE64_LENGTH = 4_000_000;

function validImage(image: unknown): IncomingImage | null {
  if (!image || typeof image !== "object") return null;
  const { data, mimeType } = image as Partial<IncomingImage>;
  if (typeof data !== "string" || typeof mimeType !== "string") return null;
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) return null;
  if (data.length === 0 || data.length > MAX_IMAGE_BASE64_LENGTH) return null;
  return { data, mimeType };
}

export async function POST(req: NextRequest) {
  const { messages, personaId, langMode, image } = await req.json();

  if (!process.env.GEMINI_API_KEY) {
    return new Response("GEMINI_API_KEY is not configured", { status: 500 });
  }

  const persona = getPersona(personaId);
  const systemPrompt = buildSystemPrompt(persona, langMode);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const photo = image ? validImage(image) : null;
  if (image && !photo) {
    return new Response("That photo couldn't be sent. Try a smaller one?", {
      status: 400,
    });
  }

  // Convert OpenAI-style history to Gemini "contents" (assistant -> model).
  // A photo is attached only to the newest user message, so it is paid for
  // once; earlier photos arrive as short text notes inside their messages.
  const history = messages as ChatMessage[];
  const lastIndex = history.length - 1;
  const contents = history.map((m, i) => {
    const parts: Part[] = [];
    if (photo && i === lastIndex && m.role === "user") {
      parts.push(
        createPartFromBase64(
          photo.data,
          photo.mimeType,
          PartMediaResolutionLevel.MEDIA_RESOLUTION_MEDIUM
        )
      );
    }
    parts.push({ text: m.content || "(sent a photo)" });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });

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
