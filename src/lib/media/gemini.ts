import { GoogleGenAI, PersonGeneration } from "@google/genai";
import { randomUUID } from "node:crypto";

import type { GeneratedMedia, ImageGenInput, MediaProvider } from "./types";

// Default to Imagen 4 for best text-to-image photoreal quality. Override with
// GEMINI_IMAGE_MODEL — e.g. "imagen-4.0-ultra-generate-001" (max quality) or
// "gemini-2.5-flash-image" (Nano Banana: conversational editing + reference
// images, the right tool for augmenting real media later).
const DEFAULT_IMAGE_MODEL = "imagen-4.0-generate-001";

// Aspect ratios accepted by both Imagen 4 and Gemini flash-image; anything else
// falls back to the model default.
const SUPPORTED_ASPECT_RATIOS = new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]);

function resolveImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
}

/** Google Gemini provider — Imagen 4 (generateImages) or Gemini flash-image
 *  ("Nano Banana", generateContent), selected by model id. */
export function createGeminiMediaProvider(apiKey: string): MediaProvider {
  const ai = new GoogleGenAI({ apiKey });
  return {
    async generateImage(input: ImageGenInput): Promise<GeneratedMedia> {
      const model = resolveImageModel();
      const aspectRatio =
        input.aspectRatio && SUPPORTED_ASPECT_RATIOS.has(input.aspectRatio) ? input.aspectRatio : undefined;

      // Imagen models use the dedicated generateImages endpoint.
      if (model.startsWith("imagen")) {
        const response = await ai.models.generateImages({
          model,
          prompt: input.prompt,
          config: {
            numberOfImages: 1,
            personGeneration: PersonGeneration.ALLOW_ADULT, // marketing scenes routinely include people
            ...(aspectRatio ? { aspectRatio } : {}),
          },
        });
        const image = response.generatedImages?.[0]?.image;
        if (image?.imageBytes) {
          return {
            bytes: Buffer.from(image.imageBytes, "base64"),
            contentType: image.mimeType ?? "image/png",
            model,
            jobId: randomUUID(),
          };
        }
        throw new Error("Imagen returned no image data (it may have been safety-filtered)");
      }

      // Gemini *-image models ("Nano Banana") use conversational generateContent.
      const response = await ai.models.generateContent({
        model,
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
            model,
            jobId: randomUUID(),
          };
        }
      }
      throw new Error("Gemini returned no image data");
    },
  };
}
