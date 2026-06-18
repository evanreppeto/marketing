import { GoogleGenAI, PersonGeneration } from "@google/genai";
import { randomUUID } from "node:crypto";

import type { GeneratedMedia, ImageGenInput, MediaProvider, VideoGenInput, VideoStart, VideoPoll } from "./types";

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

const DEFAULT_VIDEO_MODEL = "veo-2.0-generate-001";
const SUPPORTED_VIDEO_ASPECT = new Set(["16:9", "9:16"]);
function resolveVideoModel(): string {
  return process.env.GEMINI_VIDEO_MODEL?.trim() || DEFAULT_VIDEO_MODEL;
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
    async startVideo(input: VideoGenInput): Promise<VideoStart> {
      const model = resolveVideoModel();
      const aspectRatio =
        input.aspectRatio && SUPPORTED_VIDEO_ASPECT.has(input.aspectRatio) ? input.aspectRatio : undefined;
      const operation = await ai.models.generateVideos({
        model,
        prompt: input.prompt,
        config: {
          numberOfVideos: 1,
          personGeneration: PersonGeneration.ALLOW_ADULT,
          ...(aspectRatio ? { aspectRatio } : {}),
          ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
        },
      });
      const operationName = operation.name;
      if (!operationName) throw new Error("Veo did not return an operation name");
      return { operationName, model, jobId: randomUUID() };
    },
    async pollVideo(operationName: string): Promise<VideoPoll> {
      const operation = await ai.operations.getVideosOperation({
        operation: { name: operationName } as Awaited<ReturnType<typeof ai.models.generateVideos>>,
      });
      if (!operation.done) return { status: "running" };
      const video = operation.response?.generatedVideos?.[0]?.video;
      if (!video) throw new Error("Veo finished but returned no video (it may have been safety-filtered)");
      const contentType = video.mimeType ?? "video/mp4";
      if (video.videoBytes) {
        return { status: "done", bytes: Buffer.from(video.videoBytes, "base64"), contentType };
      }
      if (video.uri) {
        const res = await fetch(video.uri, { headers: { "x-goog-api-key": apiKey } });
        if (!res.ok) throw new Error(`Veo video download failed: ${res.status}`);
        return { status: "done", bytes: Buffer.from(await res.arrayBuffer()), contentType };
      }
      throw new Error("Veo result had neither videoBytes nor uri");
    },
  };
}
