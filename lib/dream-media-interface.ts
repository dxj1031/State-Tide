import type { DreamOutput, DreamOutputMode } from "./dream-types.ts";

export type MediaGenerationRequest = {
  mode: Exclude<DreamOutputMode, "text">;
  output: DreamOutput;
};

export type MediaGenerationResult = {
  provider: string;
  artifactUrl: string;
  metadata: Record<string, unknown>;
};

export type MediaGenerator = {
  generate(request: MediaGenerationRequest): Promise<MediaGenerationResult>;
};

export class MediaGenerationNotConfiguredError extends Error {
  constructor(mode: DreamOutputMode) {
    super(`No ${mode} generation provider is configured for this MVP.`);
  }
}

export function getMediaGenerator(): MediaGenerator {
  return {
    async generate(request) {
      throw new MediaGenerationNotConfiguredError(request.mode);
    }
  };
}
