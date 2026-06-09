import type {
  DreamIncubationRequest,
  DreamOutput,
  DreamOutputMode,
  DreamSeed,
  DreamTranslationRequest
} from "./dream-types.ts";
import {
  applyLlmPayloadToOutput,
  applyLlmPayloadToSeed,
  buildDreamSeed,
  buildFallbackDreamOutput,
  buildIncubationUserPrompt,
  buildTranslationUserPrompt
} from "./dream-prompt.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

function stripJsonFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

async function callAnthropic(prompt: string, maxTokens: number) {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return null;
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
      max_tokens: maxTokens,
      temperature: 0.4,
      system:
        "Return only valid JSON. Do not include markdown, commentary, diagnosis, predictions, or direct advice.",
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Anthropic request failed with ${response.status}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const text = payload.content?.find((block) => block.type === "text")?.text;

  if (!text) {
    throw new Error("Anthropic response did not include text content.");
  }

  return JSON.parse(stripJsonFences(text)) as Record<string, unknown>;
}

function modeTokenLimit(mode: DreamOutputMode) {
  if (mode === "text") {
    return 950;
  }

  if (mode === "music") {
    return 1200;
  }

  return 1050;
}

export async function incubateDreamWithLlm(request: DreamIncubationRequest) {
  const fallbackSeed = buildDreamSeed(request);
  const fallbackOutput = buildFallbackDreamOutput(
    fallbackSeed,
    request.mode,
    request.styleMemory,
    request.settings
  );

  try {
    const payload = await callAnthropic(buildIncubationUserPrompt(request), modeTokenLimit(request.mode));

    if (!payload) {
      return { seed: fallbackSeed, output: fallbackOutput, source: "fallback" as const };
    }

    const seed = applyLlmPayloadToSeed(fallbackSeed, payload);
    const output = applyLlmPayloadToOutput(seed, request.mode, payload);
    return { seed, output, source: "anthropic" as const };
  } catch {
    return { seed: fallbackSeed, output: fallbackOutput, source: "fallback" as const };
  }
}

export async function translateDreamWithLlm(request: DreamTranslationRequest): Promise<DreamOutput> {
  const fallbackOutput = buildFallbackDreamOutput(
    request.seed,
    request.targetMode,
    request.styleMemory,
    request.settings,
    {
      translationSourceOutputId: request.sourceOutput?.id ?? null,
      variantOfOutputId: request.variantOfOutputId ?? null
    }
  );

  try {
    const payload = await callAnthropic(
      buildTranslationUserPrompt(request),
      modeTokenLimit(request.targetMode)
    );

    if (!payload) {
      return fallbackOutput;
    }

    return applyLlmPayloadToOutput(request.seed, request.targetMode, payload, {
      translationSourceOutputId: request.sourceOutput?.id ?? null,
      variantOfOutputId: request.variantOfOutputId ?? null
    });
  } catch {
    return fallbackOutput;
  }
}
