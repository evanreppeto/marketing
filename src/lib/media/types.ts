/** Provider-agnostic media generation. Swap Gemini → Higgsfield/Vertex behind this. */
export type ImageGenInput = { prompt: string; aspectRatio?: string };

export type GeneratedMedia = {
  bytes: Buffer;
  contentType: string;
  model: string;
  jobId: string;
};

export interface MediaProvider {
  generateImage(input: ImageGenInput): Promise<GeneratedMedia>;
  // generateVideo(...) — added in Plan B
}
