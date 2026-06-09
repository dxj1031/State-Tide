import { heuristicClassifyState } from "./state-classification.ts";
import { tokenize, type JournalEntry } from "./matching.ts";
import type {
  DreamCycleCandidate,
  DreamGenerationSettings,
  DreamIncubationRequest,
  DreamOutput,
  DreamOutputMode,
  DreamSeed,
  DreamStyleMemory,
  DreamTokenEstimate,
  DreamTranslationRequest
} from "./dream-types.ts";
import {
  classifyDreamAbstraction,
  suggestedModeForAbstraction
} from "./dream-cycles.ts";

const NEGATIVE_IMAGE_PROMPT =
  "No recognizable faces, no real names, no identifiable private locations, no gore, no clinical diagnosis symbols, no horror shock imagery, no text overlays, no watermark.";

const SYSTEM_DREAM_PROMPT =
  "You generate reflective dream artifacts from journal data. Stay in English. Use the user's source details without exposing identity. Do not diagnose, predict, command, or present mystical certainty. Preserve the provided core imagery cluster across modes.";

function nowStamp() {
  return new Date().toISOString();
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "dream"
  );
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function compactText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function titleCase(text: string) {
  return text
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function topTerms(entries: JournalEntry[], limit: number) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    for (const token of tokenize(entry.text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token]) => token)
    .slice(0, limit);
}

function deriveDominantEmotions(entries: JournalEntry[]) {
  const labels = entries.flatMap((entry) => heuristicClassifyState(entry.text).record.emotion_labels);
  const counts = new Map<string, number>();

  for (const label of labels) {
    if (label !== "neutral") {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const dominant = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label]) => label)
    .slice(0, 3);

  return dominant.length > 0 ? dominant : ["neutral"];
}

function deriveImageryCluster(entries: JournalEntry[], styleMemory: DreamStyleMemory) {
  const terms = topTerms(entries, 8);
  const concreteCandidates = [
    "desk",
    "tidewater",
    "unread page",
    "dim hallway",
    "repeating paragraph",
    "midnight room",
    "unfinished task",
    "quiet window"
  ];
  const sourceDetails = terms
    .filter((term) => !styleMemory.avoided_symbols.includes(term))
    .slice(0, 4);
  const cluster = unique([...sourceDetails, ...styleMemory.preferred_symbols, ...concreteCandidates]).filter(
    (symbol) => !styleMemory.avoided_symbols.some((avoid) => symbol.includes(avoid))
  );

  return cluster.slice(0, 6);
}

function deriveTrajectory(entries: JournalEntry[]) {
  return entries.slice(0, 6).map((entry) => {
    const analysis = heuristicClassifyState(entry.text).record;
    const emotion = analysis.emotion_labels.filter((label) => label !== "neutral")[0] ?? "neutral";
    return `${entry.date}: ${emotion}, intensity ${analysis.emotion_intensity}/10`;
  });
}

function estimateOutputTokens(mode: DreamOutputMode) {
  if (mode === "text") {
    return 520;
  }

  if (mode === "music") {
    return 720;
  }

  return 620;
}

export function estimateDreamTokens(
  entries: JournalEntry[],
  cycle: DreamCycleCandidate,
  mode: DreamOutputMode,
  styleMemory: DreamStyleMemory
): DreamTokenEstimate {
  const sourceChars = entries.reduce((sum, entry) => sum + entry.text.length + 80, 0);
  const cbtChars = entries.length * 420;
  const styleChars = JSON.stringify(styleMemory).length;
  const promptChars = SYSTEM_DREAM_PROMPT.length + cycle.rationale.length + styleChars + 1200;
  const estimatedTokens = Math.ceil((sourceChars + cbtChars + promptChars) / 4 + estimateOutputTokens(mode));
  const level = estimatedTokens < 2500 ? "Low" : estimatedTokens < 6000 ? "Medium" : "High";

  return {
    estimatedTokens,
    level,
    reason: `Estimated from ${entries.length} source fragments, CBT summaries, style memory, system instructions, and expected ${mode} output.`
  };
}

export function buildDreamSeed(request: DreamIncubationRequest): DreamSeed {
  const sourceEntries = request.sourceEntries;
  const abstractionLevel = classifyDreamAbstraction(sourceEntries);
  const suggestedMode = request.settings.output_preference === "auto"
    ? suggestedModeForAbstraction(abstractionLevel)
    : request.settings.output_preference;
  const dominantEmotions = deriveDominantEmotions(sourceEntries);
  const imageryCluster = deriveImageryCluster(sourceEntries, request.styleMemory);
  const firstImage = imageryCluster[0] ?? "recurring room";
  const title = titleCase(`${dominantEmotions[0] ?? "reflective"} tide with ${firstImage}`);
  const timestamp = nowStamp();
  const id = `${slugify(title)}-${Date.now()}`;
  const summary = `A ${request.cycle.type} tide from ${request.cycle.startDate} to ${request.cycle.endDate}, shaped by ${dominantEmotions.join(", ")} and carried by ${imageryCluster.slice(0, 3).join(", ")}.`;

  return {
    id,
    createdAt: timestamp,
    updatedAt: timestamp,
    title,
    summary,
    cycle: request.cycle,
    sourceEntryIds: request.sourceEntries.map((entry) => entry.id),
    dominantEmotions,
    imageryCluster,
    emotionalTrajectory: deriveTrajectory(sourceEntries),
    abstractionLevel,
    suggestedMode,
    coreStyle: `${request.settings.tone} tone, ${request.styleMemory.text_style}, ${request.styleMemory.image_style}, ${request.styleMemory.music_style}`,
    explanation: [
      {
        label: "Cycle",
        source: request.cycle.label,
        rationale: request.cycle.rationale
      },
      {
        label: "Imagery cluster",
        source: imageryCluster.join(", "),
        rationale: "Core images are derived from repeated source language, preferred symbols, and stable dream metaphors."
      },
      {
        label: "Mode",
        source: suggestedMode,
        rationale: `The selected fragments read as ${abstractionLevel}; abstract tides map to music, balanced tides to text, and concrete tides to image.`
      }
    ],
    tokenEstimate: estimateDreamTokens(sourceEntries, request.cycle, request.mode, request.styleMemory)
  };
}

function sourceDetailLine(seed: DreamSeed) {
  return `Core imagery cluster to preserve exactly: ${seed.imageryCluster.join(", ")}. Dominant emotions: ${seed.dominantEmotions.join(", ")}. Emotional trajectory: ${seed.emotionalTrajectory.join(" | ")}.`;
}

function buildTextDream(seed: DreamSeed, styleMemory: DreamStyleMemory, settings: DreamGenerationSettings) {
  return compactText(
    `The room has been visited before, though never for long. On the desk, ${seed.imageryCluster[0] ?? "a page"} waits under a thin skin of tidewater. The ${seed.imageryCluster[1] ?? "hallway"} keeps its light low, and every object seems to remember the days when attention broke apart and then returned. A page repeats itself, not as punishment, but as a signal: this pattern has a shape, and the shape has gaps. The dreamer touches ${seed.imageryCluster[2] ?? "an unfinished task"} and notices it does not stay the same. Sometimes it asks for rest. Sometimes it asks for a door. Sometimes it becomes quiet enough to name. By the window, the water pulls back and leaves small marks where the tide had been. They are not instructions. They are evidence. The dream ends before the room is solved, with the desk still visible, the tide lower than before, and the recurring state held as something that appears, changes, and disappears.`
  ).slice(0, settings.detail_exposure === "high" ? 1800 : 1300);
}

function buildImagePrompt(seed: DreamSeed, styleMemory: DreamStyleMemory, settings: DreamGenerationSettings) {
  return [
    `Create a symbolic, data-driven dream image with this exact core imagery cluster: ${seed.imageryCluster.join(", ")}.`,
    `Mood: ${seed.dominantEmotions.join(", ")}; tone: ${settings.tone}; explanation style: ${styleMemory.explanation_tone}.`,
    `Composition: one quiet interior scene, no visible face, no identifiable person, ${seed.imageryCluster[0] ?? "desk"} as the anchor, layered visual echoes of ${seed.cycle.type} across the space.`,
    `Visual style: ${styleMemory.image_style}. Use restrained color contrast, readable object silhouettes, soft surreal logic, and concrete details from the source fragments without using names or private identifiers.`,
    "Lighting: low natural light with a clear focal path. Camera: medium-wide, slightly elevated perspective. Detail level: high enough for inspection, not decorative blur.",
    "The image should feel reflective and therapeutic, not fortune-telling and not diagnostic."
  ].join(" ");
}

function buildMusicPrompt(seed: DreamSeed, styleMemory: DreamStyleMemory, settings: DreamGenerationSettings) {
  return [
    `Compose a playable instrumental piece from this exact core imagery cluster: ${seed.imageryCluster.join(", ")}.`,
    `Primary mood: ${seed.dominantEmotions.join(", ")}; tone: ${settings.tone}; style direction: ${styleMemory.music_style}.`,
    "Tempo: 62-76 BPM unless the model requires a single value; use slow pulse with slight instability.",
    "Key/harmony: minor or modal center with suspended resolution; avoid melodrama.",
    "Instrumentation: soft piano or felt keys, low warm pad, sparse granular texture, quiet field-like noise, occasional glassy accents.",
    "Texture: recurring motif with gaps, restrained density, subtle swells that mirror emotional recurrence and interruption.",
    `Structure: 45-75 seconds, A-B-A arc; A introduces ${seed.imageryCluster[0] ?? "the anchor image"}, B adds tension from ${seed.imageryCluster[1] ?? "the second image"}, final A returns thinner and calmer.`,
    "Dynamics: start low, rise gently, leave space between phrases. No vocals, no lyrics, no sudden horror cues."
  ].join(" ");
}

export function buildFallbackDreamOutput(
  seed: DreamSeed,
  mode: DreamOutputMode,
  styleMemory: DreamStyleMemory,
  settings: DreamGenerationSettings,
  options: {
    translationSourceOutputId?: string | null;
    variantOfOutputId?: string | null;
  } = {}
): DreamOutput {
  const createdAt = nowStamp();
  const id = `${seed.id}-${mode}-${Date.now()}`;
  const content =
    mode === "text"
      ? buildTextDream(seed, styleMemory, settings)
      : mode === "image"
        ? buildImagePrompt(seed, styleMemory, settings)
        : buildMusicPrompt(seed, styleMemory, settings);

  return {
    id,
    seedId: seed.id,
    mode,
    createdAt,
    title: `${seed.title} (${mode})`,
    content,
    prompt: mode === "text" ? "" : content,
    negativePrompt: mode === "image" ? NEGATIVE_IMAGE_PROMPT : null,
    technicalNotes:
      mode === "music"
        ? ["Model-neutral prompt", "Playable audio target", "Preserve core imagery as sonic structure"]
        : mode === "image"
          ? ["Model-neutral prompt", "No recognizable faces", "Preserve core imagery as visible objects"]
          : ["150-300 word target", "Direct dream text", "No diagnostic framing"],
    translationSourceOutputId: options.translationSourceOutputId ?? null,
    variantOfOutputId: options.variantOfOutputId ?? null
  };
}

export function buildIncubationUserPrompt(request: DreamIncubationRequest) {
  const cbtBlocks = request.sourceEntries.map((entry) => {
    const analysis = heuristicClassifyState(entry.text).record;
    return {
      id: entry.id,
      date: entry.date,
      text: entry.text,
      cbt: {
        situation: analysis.situation,
        automatic_thought: analysis.automatic_thought,
        emotion_labels: analysis.emotion_labels,
        emotion_intensity: analysis.emotion_intensity,
        behavior: analysis.behavior
      }
    };
  });

  return [
    SYSTEM_DREAM_PROMPT,
    `Cycle: ${request.cycle.label}. ${request.cycle.rationale}`,
    `Mode requested: ${request.mode}. Tone: ${request.settings.tone}. Detail exposure: ${request.settings.detail_exposure}.`,
    `Style memory: ${JSON.stringify(request.styleMemory)}.`,
    `Source fragments with CBT analysis: ${JSON.stringify(cbtBlocks)}.`,
    "Return JSON only with {\"title\": string, \"summary\": string, \"imagery_cluster\": string[], \"emotional_trajectory\": string[], \"core_style\": string, \"output\": string, \"negative_prompt\": string | null, \"technical_notes\": string[], \"explanation\": [{\"label\": string, \"source\": string, \"rationale\": string}]}. Text mode output must be 150-300 words. Image and music modes must be detailed, model-neutral, copy-ready prompts."
  ].join("\n\n");
}

export function buildTranslationUserPrompt(request: DreamTranslationRequest) {
  return [
    SYSTEM_DREAM_PROMPT,
    sourceDetailLine(request.seed),
    `Translate the existing dream output to ${request.targetMode}. Do not change the core imagery cluster.`,
    `Existing output: ${request.sourceOutput?.content ?? "No prior output supplied; create a new mode output from the seed."}`,
    `Style memory: ${JSON.stringify(request.styleMemory)}.`,
    `Settings: ${JSON.stringify(request.settings)}.`,
    "Return JSON only with {\"output\": string, \"negative_prompt\": string | null, \"technical_notes\": string[]}. Text mode output must be direct dream text. Image and music modes must be detailed copy-ready prompts."
  ].join("\n\n");
}

export function applyLlmPayloadToSeed(
  seed: DreamSeed,
  payload: Record<string, unknown>
): DreamSeed {
  return {
    ...seed,
    title: typeof payload.title === "string" ? compactText(payload.title) : seed.title,
    summary: typeof payload.summary === "string" ? compactText(payload.summary) : seed.summary,
    imageryCluster: Array.isArray(payload.imagery_cluster)
      ? unique(payload.imagery_cluster.filter((item): item is string => typeof item === "string")).slice(0, 8)
      : seed.imageryCluster,
    emotionalTrajectory: Array.isArray(payload.emotional_trajectory)
      ? payload.emotional_trajectory.filter((item): item is string => typeof item === "string").slice(0, 8)
      : seed.emotionalTrajectory,
    coreStyle: typeof payload.core_style === "string" ? compactText(payload.core_style) : seed.coreStyle,
    explanation: Array.isArray(payload.explanation)
      ? payload.explanation
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }

            const candidate = item as Record<string, unknown>;
            return {
              label: typeof candidate.label === "string" ? compactText(candidate.label) : "Source",
              source: typeof candidate.source === "string" ? compactText(candidate.source) : "Dream data",
              rationale: typeof candidate.rationale === "string" ? compactText(candidate.rationale) : "Mapped from the selected tide."
            };
          })
          .filter((item): item is DreamSeed["explanation"][number] => item !== null)
      : seed.explanation
  };
}

export function applyLlmPayloadToOutput(
  seed: DreamSeed,
  mode: DreamOutputMode,
  payload: Record<string, unknown>,
  options: {
    translationSourceOutputId?: string | null;
    variantOfOutputId?: string | null;
  } = {}
): DreamOutput {
  const fallback = buildFallbackDreamOutput(seed, mode, DEFAULT_STYLE_MEMORY_LIKE, DEFAULT_SETTINGS_LIKE, options);
  const output = typeof payload.output === "string" ? compactText(payload.output) : fallback.content;

  return {
    ...fallback,
    content: output,
    prompt: mode === "text" ? "" : output,
    negativePrompt:
      typeof payload.negative_prompt === "string"
        ? compactText(payload.negative_prompt)
        : mode === "image"
          ? NEGATIVE_IMAGE_PROMPT
          : null,
    technicalNotes: Array.isArray(payload.technical_notes)
      ? payload.technical_notes.filter((item): item is string => typeof item === "string").slice(0, 8)
      : fallback.technicalNotes
  };
}

const DEFAULT_STYLE_MEMORY_LIKE: DreamStyleMemory = {
  preferred_tone: "gentle",
  rejected_tone: [],
  preferred_symbols: [],
  avoided_symbols: [],
  detail_level_preference: "medium",
  perceived_fit_notes: [],
  music_style: "ambient, restrained, textural",
  image_style: "symbolic editorial illustration",
  text_style: "lyrical but clear",
  explanation_tone: "gentle"
};

const DEFAULT_SETTINGS_LIKE: DreamGenerationSettings = {
  require_token_approval: true,
  detail_exposure: "medium",
  output_preference: "auto",
  tone: "gentle"
};
