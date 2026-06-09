import type { JournalEntry } from "./matching.ts";

export type DreamOutputMode = "text" | "image" | "music";

export type DreamCycleType = "manual" | "recurrence" | "gap" | "transformation";

export type DreamAbstractionLevel = "abstract" | "balanced" | "concrete";

export type TokenUseLevel = "Low" | "Medium" | "High";

export type ExplanationTone = "clinical" | "gentle" | "poetic" | "shadow";

export type DetailExposure = "low" | "medium" | "high";

export type DreamTone = "gentle" | "neutral" | "surreal" | "shadow";

export type DreamCycleCandidate = {
  id: string;
  type: DreamCycleType;
  label: string;
  rationale: string;
  startDate: string;
  endDate: string;
  entryIds: string[];
  score: number;
};

export type DreamStyleMemory = {
  preferred_tone: DreamTone;
  rejected_tone: string[];
  preferred_symbols: string[];
  avoided_symbols: string[];
  detail_level_preference: DetailExposure;
  perceived_fit_notes: string[];
  music_style: string;
  image_style: string;
  text_style: string;
  explanation_tone: ExplanationTone;
};

export type DreamGenerationSettings = {
  require_token_approval: boolean;
  detail_exposure: DetailExposure;
  output_preference: "auto" | DreamOutputMode;
  tone: DreamTone;
};

export type DreamTokenEstimate = {
  estimatedTokens: number;
  level: TokenUseLevel;
  reason: string;
};

export type DreamSeed = {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  summary: string;
  cycle: DreamCycleCandidate;
  sourceEntryIds: string[];
  dominantEmotions: string[];
  imageryCluster: string[];
  emotionalTrajectory: string[];
  abstractionLevel: DreamAbstractionLevel;
  suggestedMode: DreamOutputMode;
  coreStyle: string;
  explanation: DreamExplanationItem[];
  tokenEstimate: DreamTokenEstimate;
};

export type DreamExplanationItem = {
  label: string;
  source: string;
  rationale: string;
};

export type DreamOutput = {
  id: string;
  seedId: string;
  mode: DreamOutputMode;
  createdAt: string;
  title: string;
  content: string;
  prompt: string;
  negativePrompt: string | null;
  technicalNotes: string[];
  translationSourceOutputId: string | null;
  variantOfOutputId: string | null;
};

export type DreamRecord = {
  seed: DreamSeed;
  outputs: DreamOutput[];
  feedback: DreamFeedback[];
};

export type DreamFeedback = {
  id: string;
  seedId: string;
  outputId: string | null;
  createdAt: string;
  fitScore: number | null;
  styleFeedback: string;
  applyScope: "none" | "future_dreams" | "same_cycle_type";
  appliedToMemory: boolean;
};

export type DreamRepository = {
  listDreams(): Promise<DreamRecord[]>;
  getDream(seedId: string): Promise<DreamRecord | null>;
  saveDream(seed: DreamSeed, output: DreamOutput): Promise<DreamRecord>;
  addOutput(output: DreamOutput): Promise<DreamOutput>;
  deleteDream(seedId: string): Promise<void>;
  addFeedback(feedback: DreamFeedback): Promise<DreamFeedback>;
  getStyleMemory(): Promise<DreamStyleMemory>;
  saveStyleMemory(memory: DreamStyleMemory): Promise<DreamStyleMemory>;
  getGenerationSettings(): Promise<DreamGenerationSettings>;
  saveGenerationSettings(settings: DreamGenerationSettings): Promise<DreamGenerationSettings>;
};

export type DreamIncubationRequest = {
  cycle: DreamCycleCandidate;
  sourceEntries: JournalEntry[];
  mode: DreamOutputMode;
  styleMemory: DreamStyleMemory;
  settings: DreamGenerationSettings;
};

export type DreamTranslationRequest = {
  seed: DreamSeed;
  sourceOutput: DreamOutput | null;
  targetMode: DreamOutputMode;
  styleMemory: DreamStyleMemory;
  settings: DreamGenerationSettings;
  variantOfOutputId?: string | null;
};

export const DEFAULT_STYLE_MEMORY: DreamStyleMemory = {
  preferred_tone: "gentle",
  rejected_tone: [],
  preferred_symbols: [],
  avoided_symbols: ["recognizable faces", "real names", "medical diagnosis symbols"],
  detail_level_preference: "medium",
  perceived_fit_notes: [],
  music_style: "ambient, restrained, textural, emotionally precise",
  image_style: "symbolic editorial illustration, quiet surrealism, no recognizable faces",
  text_style: "lyrical but clear, grounded in concrete journal details",
  explanation_tone: "gentle"
};

export const DEFAULT_GENERATION_SETTINGS: DreamGenerationSettings = {
  require_token_approval: true,
  detail_exposure: "medium",
  output_preference: "auto",
  tone: "gentle"
};
