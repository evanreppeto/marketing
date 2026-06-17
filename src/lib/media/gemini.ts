import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";

import type { GeneratedMedia, ImageGenInput, MediaProvider } from "./types";

const IMAGE_MODEL = "gemini-2.5-flash-image";

/** Google Gemini provider (Gemini 2.5 Flash Image, "Nano Banana"). */
export function createGeminiMediaProvider(apiKey: string): MediaProvider {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generateImage(input: ImageGenInput): Promise<GeneratedMedia> {
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: input.prompt,
      });
      const parts = response.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        const inline = part.inlineData;
        if (inline?.data) {
          return {
            bytes: Buffer.from(inline.data, "base64"),
            contentType: inline.mimeType ?? "image/png",
            model: IMAGE_MODEL,
            jobId: randomUUID(),
          };
        }
      }
      throw new Error("Gemini returned no image data");
    },
  };
}
