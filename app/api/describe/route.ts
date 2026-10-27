import { NextRequest } from "next/server";
import {
  GoogleGenAI,
  PartMediaResolutionLevel,
  ThinkingLevel,
  createPartFromBase64,
} from "@google/genai";

export const runtime = "nodejs";
export const preferredRegion = "hkg1";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BASE64_LENGTH = 4_000_000;

/**
 * Writes a one-line note describing a photo. The note is stored with the
 * message and stands in for the photo on later turns, so the full image is
 * only ever sent to the chat model once. Runs in parallel with /api/chat, at
 * LOW media resolution (~280 tokens) to keep it cheap.
 */
export async function POST(req: NextRequest) {
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: "GEMINI_API_KEY is not configured" }, { status: 500 });
  }

  const { image } = await req.json();
  const data = image?.data;
  const mimeType = image?.mimeType;
  if (
    typeof data !== "string" ||
    typeof mimeType !== "string" ||
    !ALLOWED_IMAGE_TYPES.has(mimeType) ||
    data.length === 0 ||
    data.length > MAX_IMAGE_BASE64_LENGTH
  ) {
    return Response.json({ error: "Invalid image" }, { status: 400 });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  try {
    const result = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            createPartFromBase64(
              data,
              mimeType,
              PartMediaResolutionLevel.MEDIA_RESOLUTION_LOW
            ),
            {
              text:
                "Describe this photo in one plain, factual English sentence of at most 25 words, " +
                "so it can be remembered later in a conversation. Mention any readable text briefly. " +
                "No preamble, no opinions.",
            },
          ],
        },
      ],
      config: {
        temperature: 1.0,
        maxOutputTokens: 120,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });

    const note = (result.text ?? "").trim().replace(/\s+/g, " ").slice(0, 300);
    return Response.json({ note });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Describe failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
