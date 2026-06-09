import type {
  DreamFeedback,
  DreamGenerationSettings,
  DreamOutput,
  DreamRecord,
  DreamRepository,
  DreamSeed,
  DreamStyleMemory
} from "./dream-types.ts";
import {
  DEFAULT_GENERATION_SETTINGS,
  DEFAULT_STYLE_MEMORY
} from "./dream-types.ts";

export type DreamStoreProvider = "sqlite" | "cloud";

let repository: DreamRepository | null = null;

export async function getDreamRepository(): Promise<DreamRepository> {
  if (repository) {
    return repository;
  }

  const provider = (process.env.DREAM_STORE_PROVIDER ?? "sqlite") as DreamStoreProvider;

  if (provider !== "sqlite") {
    throw new Error("Cloud dream store provider is not configured yet.");
  }

  const { createSqliteDreamRepository } = await import("./dream-store-sqlite.ts");
  repository = createSqliteDreamRepository();
  return repository;
}

export function makeFeedback(input: {
  seedId: string;
  outputId?: string | null;
  fitScore?: number | null;
  styleFeedback: string;
  applyScope: DreamFeedback["applyScope"];
  appliedToMemory?: boolean;
}): DreamFeedback {
  return {
    id: `feedback-${Date.now()}`,
    seedId: input.seedId,
    outputId: input.outputId ?? null,
    createdAt: new Date().toISOString(),
    fitScore:
      typeof input.fitScore === "number"
        ? Math.max(1, Math.min(5, Math.round(input.fitScore)))
        : null,
    styleFeedback: input.styleFeedback.trim(),
    applyScope: input.applyScope,
    appliedToMemory: input.appliedToMemory ?? false
  };
}

export function mergeFeedbackIntoStyleMemory(
  memory: DreamStyleMemory,
  feedback: DreamFeedback
): DreamStyleMemory {
  if (!feedback.appliedToMemory || !feedback.styleFeedback.trim()) {
    return memory;
  }

  return {
    ...memory,
    perceived_fit_notes: [feedback.styleFeedback.trim(), ...memory.perceived_fit_notes].slice(0, 12)
  };
}

export function normalizeSettings(value: Partial<DreamGenerationSettings>): DreamGenerationSettings {
  return {
    ...DEFAULT_GENERATION_SETTINGS,
    ...value
  };
}

export function normalizeStyleMemory(value: Partial<DreamStyleMemory>): DreamStyleMemory {
  return {
    ...DEFAULT_STYLE_MEMORY,
    ...value,
    rejected_tone: Array.isArray(value.rejected_tone) ? value.rejected_tone : DEFAULT_STYLE_MEMORY.rejected_tone,
    preferred_symbols: Array.isArray(value.preferred_symbols)
      ? value.preferred_symbols
      : DEFAULT_STYLE_MEMORY.preferred_symbols,
    avoided_symbols: Array.isArray(value.avoided_symbols)
      ? value.avoided_symbols
      : DEFAULT_STYLE_MEMORY.avoided_symbols,
    perceived_fit_notes: Array.isArray(value.perceived_fit_notes)
      ? value.perceived_fit_notes
      : DEFAULT_STYLE_MEMORY.perceived_fit_notes
  };
}

export function sortDreamRecords(records: DreamRecord[]) {
  return [...records].sort((a, b) => b.seed.createdAt.localeCompare(a.seed.createdAt));
}

export function recordFromParts(
  seed: DreamSeed,
  outputs: DreamOutput[] = [],
  feedback: DreamFeedback[] = []
): DreamRecord {
  return {
    seed,
    outputs: [...outputs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    feedback: [...feedback].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}
