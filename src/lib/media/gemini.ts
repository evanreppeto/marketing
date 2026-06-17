import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";

import type { GeneratedMedia, ImageGenInput, MediaProvider } from "./types";

const IMAGE_MODEL = "gemini-2.5-flash-image";

// Aspect ratios the image model accepts; anything else falls back to the default.
const SUPPORTED_ASPECT_RATIOS = new Set(["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"]);

/** Google Gemini provider (Gemini 2.5 Flash Image, "Nano Banana"). */
export function createGeminiMediaProvider(apiKey: string): MediaProvider {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generateImage(input: ImageGenInput): Promise<GeneratedMedia> {
      const aspectRatio = input.aspectRatio && SUPPORTED_ASPECT_RATIOS.has(input.aspectRatio) ? input.aspectRatio : undefined;
      const response = await ai.models.generateContent({
        model: IMAGE_MODEL,
        contents: input.prompt,
        ...(aspectRatio ? { config: { imageConfig: { aspectRatio } } } : {}),
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
