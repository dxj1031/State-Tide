import {
  isEmotionVocabularyLabel,
  type ClassificationResult,
  type StructuredStateAnalysis
} from "./state-classification.ts";

export type TraceStage =
  | "input"
  | "state-nodes"
  | "contract"
  | "request"
  | "response"
  | "fallback"
  | "normalize"
  | "score"
  | "done";

export type TraceField = { k: string; v: string };

/** Which engine actually supplied each field of the structured record. */
export type TraceProvenance = {
  field: string;
  source: "llm" | "local";
  value: string;
};

export type TraceEvent = {
  stage: TraceStage;
  /** Milliseconds since the request entered the route. */
  at: number;
  title: string;
  note?: string;
  fields?: TraceField[];
  /** Verbatim payload (raw model output), rendered in a <pre>. */
  code?: string;
  provenance?: TraceProvenance[];
  guards?: string[];
  /** false marks a degraded-but-handled step, e.g. the fallback. */
  ok?: boolean;
  /** Only on the terminating "done" event. */
  result?: ClassificationResult;
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "null";
  }

  return Array.isArray(value) ? value.join(", ") : String(value);
}

/**
 * Reconstructs, from the model's raw record and the normalized result, which
 * fields the model actually supplied and which guardrails rewrote its output.
 *
 * normalizeAnalysisRecord always runs the local inference too and then picks a
 * value per field, so the Claude path is a field-level merge rather than a
 * handover — this makes that visible without threading a collector through it.
 */
export function explainNormalization(
  rawRecord: Record<string, unknown>,
  analysis: StructuredStateAnalysis,
  rawText: string
): { provenance: TraceProvenance[]; guards: string[] } {
  const provenance: TraceProvenance[] = [
    {
      field: "situation",
      source: typeof rawRecord.situation === "string" ? "llm" : "local",
      value: show(analysis.situation)
    },
    {
      field: "automatic_thought",
      source: typeof rawRecord.automatic_thought === "string" ? "llm" : "local",
      value: show(analysis.automatic_thought)
    },
    {
      field: "emotion_labels",
      source: Array.isArray(rawRecord.emotion_labels) ? "llm" : "local",
      value: show(analysis.emotion_labels)
    },
    {
      field: "emotion_intensity",
      source: typeof rawRecord.emotion_intensity === "number" ? "llm" : "local",
      value: show(analysis.emotion_intensity)
    },
    {
      field: "behavior",
      source: typeof rawRecord.behavior === "string" ? "llm" : "local",
      value: show(analysis.behavior)
    }
  ];

  const guards: string[] = [];

  if (/^\s*```/.test(rawText)) {
    guards.push("Stripped markdown fences from the model output.");
  }

  if (Array.isArray(rawRecord.emotion_labels)) {
    const dropped = rawRecord.emotion_labels.filter(
      (label) => typeof label !== "string" || !isEmotionVocabularyLabel(label)
    );

    if (dropped.length > 0) {
      guards.push(
        `Dropped ${dropped.length} label(s) outside the emotion enum: ${dropped.map(show).join(", ")}.`
      );
    }
  }

  if (typeof rawRecord.emotion_intensity === "number") {
    const raw = rawRecord.emotion_intensity;

    if (raw !== analysis.emotion_intensity) {
      guards.push(`Clamped intensity ${raw} into 0-10 as ${analysis.emotion_intensity}.`);
    }
  }

  if (typeof rawRecord.automatic_thought === "string" && analysis.automatic_thought === null) {
    guards.push("Discarded automatic_thought: it restated the situation.");
  }

  if (typeof rawRecord.behavior === "string" && analysis.behavior === null) {
    guards.push("Discarded behavior: it restated the situation.");
  }

  return { provenance, guards };
}
