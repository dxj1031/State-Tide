import { tokenize } from "./matching.ts";

export const EMOTION_LABELS = [
  "anxious",
  "nervous",
  "overwhelmed",
  "sad",
  "drained",
  "frustrated",
  "uncertain",
  "neutral"
] as const;

export type EmotionLabel = (typeof EMOTION_LABELS)[number];

export type StructuredStateAnalysis = {
  situation: string | null;
  automatic_thought: string | null;
  emotion_labels: EmotionLabel[];
  emotion_intensity: number;
  behavior: string | null;
};

export type StateFragment = {
  key: string;
  label: string;
  emoji: string;
  evidence: string[];
};

export type StateNode = {
  id: string;
  label: string;
  summary: string;
  tags: string[];
  emojis: string[];
};

export type StateMatch = {
  state_id: string;
  label: string;
  score: number;
  reason: string;
};

export type InferredStateRecord = {
  id: string;
  text: string;
  timestamp: string;
  situation: string | null;
  automatic_thought: string | null;
  emotion_labels: EmotionLabel[];
  emotion_intensity: number;
  behavior: string | null;
  alternative_framing: string | null;
  tags: string[];
  similar_states: Array<{
    state_id: string;
    score: number;
    reason: string;
  }>;
  is_novel: boolean;
};

export type NewStateCandidate = {
  label: string;
  summary: string;
  tags: string[];
  emojis?: string[];
};

export type ClassificationResult = {
  stateKey: string;
  label: string;
  emojis: string[];
  fragments: StateFragment[];
  record: InferredStateRecord;
  source: "anthropic" | "heuristic";
  matches: StateMatch[];
  isNovel: boolean;
  newState: NewStateCandidate | null;
};

type FragmentRule = {
  key: string;
  label: string;
  emoji: string;
  terms: string[];
};

type EmotionRule = {
  label: EmotionLabel;
  baseIntensity: number;
  terms: string[];
};

type ClassificationOverrides = {
  matches?: StateMatch[];
  isNovel?: boolean;
  newState?: NewStateCandidate | null;
  label?: string;
  stateKey?: string;
  emojis?: string[];
  fragments?: StateFragment[];
  alternativeFraming?: string | null;
  timestamp?: string;
  tags?: string[];
};

const FALLBACK_EMOJI = "\u{1FAE8}";
const NOVELTY_THRESHOLD = 0.42;

export const EMOTION_EMOJIS: Record<EmotionLabel, string> = {
  anxious: "\u{1F61F}",
  nervous: "\u{1FAE8}",
  overwhelmed: "\u{1F635}",
  sad: "\u{1F636}",
  drained: "\u{1F971}",
  frustrated: "\u{1F624}",
  uncertain: "\u{1F615}",
  neutral: "\u{1F642}"
};

const EMOTION_ALIASES: Record<string, EmotionLabel> = {
  anxious: "anxious",
  worry: "anxious",
  worried: "anxious",
  panicked: "anxious",
  panic: "anxious",
  tense: "anxious",
  dread: "anxious",
  nervous: "nervous",
  uneasy: "nervous",
  restless: "nervous",
  jittery: "nervous",
  shaky: "nervous",
  wired: "nervous",
  overwhelmed: "overwhelmed",
  flooded: "overwhelmed",
  overloaded: "overwhelmed",
  buried: "overwhelmed",
  swamped: "overwhelmed",
  spinning: "overwhelmed",
  crowded: "overwhelmed",
  sad: "sad",
  low: "sad",
  numb: "sad",
  detached: "sad",
  distant: "sad",
  blank: "sad",
  flat: "sad",
  foggy: "sad",
  empty: "sad",
  drained: "drained",
  tired: "drained",
  exhausted: "drained",
  sluggish: "drained",
  slowed: "drained",
  heavy: "drained",
  frustrated: "frustrated",
  irritated: "frustrated",
  annoyed: "frustrated",
  blocked: "frustrated",
  stuck: "frustrated",
  uncertain: "uncertain",
  unsure: "uncertain",
  unclear: "uncertain",
  wavering: "uncertain",
  drifting: "uncertain",
  neutral: "neutral",
  clear: "neutral",
  steady: "neutral",
  normal: "neutral",
  okay: "neutral",
  ok: "neutral",
  fine: "neutral",
  settled: "neutral"
};

const FRAGMENT_RULES: FragmentRule[] = [
  {
    key: "detached",
    label: "detached",
    emoji: "\u{1F636}",
    terms: ["detached", "distant", "far", "fog", "foggy", "flat", "numb", "blank"]
  },
  {
    key: "restless",
    label: "restless",
    emoji: "\u{1FAE8}",
    terms: ["restless", "loop", "fragmented", "unfinished", "scattered", "drift", "agitated"]
  },
  {
    key: "drained",
    label: "drained",
    emoji: "\u{1F971}",
    terms: ["slowed", "slow", "heavy", "stalled", "hard to begin", "stuck", "exhausted", "drained"]
  },
  {
    key: "overwhelmed",
    label: "overwhelmed",
    emoji: "\u{1F635}",
    terms: ["flooded", "overwhelmed", "too much", "crowded", "spinning", "everything to do"]
  },
  {
    key: "clear",
    label: "clear",
    emoji: "\u{1F642}",
    terms: ["clear", "steady", "settled", "normal", "held", "order", "okay"]
  }
];

const EMOTION_RULES: EmotionRule[] = [
  {
    label: "anxious",
    baseIntensity: 6,
    terms: ["anxious", "worried", "worry", "panic", "panicked", "tense", "dread"]
  },
  {
    label: "nervous",
    baseIntensity: 6,
    terms: ["nervous", "restless", "jittery", "shaky", "uneasy", "wired"]
  },
  {
    label: "overwhelmed",
    baseIntensity: 8,
    terms: ["overwhelmed", "flooded", "swamped", "buried", "spinning", "too much", "everything to do"]
  },
  {
    label: "sad",
    baseIntensity: 6,
    terms: ["sad", "low", "detached", "distant", "numb", "blank", "flat", "foggy", "empty"]
  },
  {
    label: "drained",
    baseIntensity: 7,
    terms: ["drained", "tired", "exhausted", "slowed", "slow", "heavy", "hard to begin", "spent"]
  },
  {
    label: "frustrated",
    baseIntensity: 6,
    terms: ["frustrated", "annoyed", "irritated", "blocked", "stuck", "hard to", "can't", "cannot"]
  },
  {
    label: "uncertain",
    baseIntensity: 5,
    terms: ["uncertain", "unsure", "unclear", "maybe", "wavering", "drifting", "not sure"]
  },
  {
    label: "neutral",
    baseIntensity: 3,
    terms: ["clear", "steady", "normal", "okay", "ok", "fine", "settled", "ordinary"]
  }
];

const STRONG_INTENSITY_TERMS = [
  "too much",
  "everything",
  "can't",
  "cannot",
  "hard to",
  "flooded",
  "spinning",
  "stuck"
];

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "state";
}

function compactText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text: string, term: string) {
  const normalizedTerm = compactText(term.toLowerCase());

  if (normalizedTerm.includes(" ")) {
    return text.includes(normalizedTerm);
  }

  return new RegExp(`\\b${escapeRegExp(normalizedTerm)}\\b`, "i").test(text);
}

function countTermHits(text: string, terms: string[]) {
  return terms.reduce((count, term) => count + (containsTerm(text, term) ? 1 : 0), 0);
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function shortPhrase(value: string | null, maxLength = 72) {
  if (!value) {
    return null;
  }

  const compact = compactText(
    value
      .replace(/^i\s+(?:felt|feel|felt like|was|am)\s+/i, "")
      .replace(/^(?:that|because|when)\s+/i, "")
      .replace(/^to\s+/i, "")
  );

  if (!compact) {
    return null;
  }

  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1).trim()}...` : compact;
}

function splitClauses(input: string) {
  return input
    .split(/[.!?;\n]/)
    .map((part) => compactText(part))
    .filter(Boolean);
}

function normalizeComparisonToken(token: string) {
  return token
    .replace(/ing$/i, "")
    .replace(/ed$/i, "")
    .replace(/s$/i, "");
}

function phrasesAreNearDuplicates(left: string | null, right: string | null) {
  if (!left || !right) {
    return false;
  }

  const normalizedLeft = compactText(left.toLowerCase());
  const normalizedRight = compactText(right.toLowerCase());

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  const leftTokens = new Set(tokenize(normalizedLeft).map(normalizeComparisonToken));
  const rightTokens = new Set(tokenize(normalizedRight).map(normalizeComparisonToken));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size || 1;

  return overlap / union >= 0.75;
}

function normalizeEmotionLabel(value: string): EmotionLabel | null {
  const normalized = compactText(value.toLowerCase());
  return EMOTION_ALIASES[normalized] ?? null;
}

function normalizeEmotionLabels(value: unknown): EmotionLabel[] {
  if (!Array.isArray(value)) {
    return ["neutral"];
  }

  const normalized = unique(
    value
      .map((item) => (typeof item === "string" ? normalizeEmotionLabel(item) : null))
      .filter((item): item is EmotionLabel => item !== null)
  );

  if (normalized.length === 0) {
    return ["neutral"];
  }

  const withoutNeutral = normalized.filter((item) => item !== "neutral");
  return withoutNeutral.length > 0 ? withoutNeutral.slice(0, 3) : ["neutral"];
}

function inferEmotionLabels(input: string): EmotionLabel[] {
  const normalizedText = compactText(input.toLowerCase());
  const scores = EMOTION_RULES.map((rule) => ({
    label: rule.label,
    baseIntensity: rule.baseIntensity,
    score: countTermHits(normalizedText, rule.terms)
  }))
    .filter((rule) => rule.score > 0)
    .sort((a, b) => b.score - a.score || b.baseIntensity - a.baseIntensity);

  if (scores.length === 0) {
    return ["neutral"];
  }

  const selected = scores
    .map((rule) => rule.label)
    .filter((label) => label !== "neutral")
    .slice(0, 3);

  return selected.length > 0 ? selected : ["neutral"];
}

function inferIntensityFromAnalysis(input: string, emotionLabels: EmotionLabel[]) {
  if (emotionLabels.length === 1 && emotionLabels[0] === "neutral") {
    return 3;
  }

  const base = Math.max(
    5,
    ...emotionLabels.map((label) => EMOTION_RULES.find((rule) => rule.label === label)?.baseIntensity ?? 5)
  );
  const emphasis = STRONG_INTENSITY_TERMS.reduce(
    (count, term) => count + (containsTerm(input.toLowerCase(), term) ? 1 : 0),
    0
  );

  return Math.max(0, Math.min(10, Math.round(base + Math.min(2, emphasis))));
}

function inferSituation(input: string) {
  const normalized = compactText(input);
  const patterns = [
    /\bwhen ([^.!?]+)/i,
    /\bwhile ([^.!?]+)/i,
    /\bafter ([^.!?]+)/i,
    /\bbefore ([^.!?]+)/i,
    /\b(during [^.!?]+)/i,
    /\b(at work|at home|tonight|today|this morning|this afternoon|this evening|last night)\b/i
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (match) {
      return shortPhrase(match[1] ?? match[0]);
    }
  }

  const first = splitClauses(normalized)[0] ?? "";
  const stripped = shortPhrase(
    first
      .replace(/^i\s+felt\s+\w+\s+/i, "")
      .replace(/^i\s+/i, "")
      .replace(/^(detached|restless|overwhelmed|drained|nervous|anxious)\b[, ]*/i, "")
  );

  return stripped;
}

function inferAutomaticThought(input: string, emotionLabels: EmotionLabel[]) {
  const normalized = compactText(input.toLowerCase());

  if (containsTerm(normalized, "hard to begin") || containsTerm(normalized, "hard to start")) {
    return "Starting will take too much effort.";
  }

  if (containsTerm(normalized, "everything i still had to do") || containsTerm(normalized, "too much")) {
    return "There is too much to handle right now.";
  }

  if (
    emotionLabels.some((label) => label === "anxious" || label === "nervous") &&
    /(hackathon|presentation|interview|meeting|participate|submit)/i.test(input)
  ) {
    return "I might not be good enough.";
  }

  if (containsTerm(normalized, "stuck") || containsTerm(normalized, "same paragraph")) {
    return "I am not getting anywhere.";
  }

  if (containsTerm(normalized, "can't") || containsTerm(normalized, "cannot")) {
    return "I cannot keep up with this right now.";
  }

  return null;
}

function inferBehavior(input: string, situation: string | null) {
  const clauses = splitClauses(input);
  const behaviorPattern =
    /\b(rereading|reread|reading|scrolling|avoiding|avoided|stayed|paced|looping|looped|answered|kept going|stopped working|worked|working|went outside|go outside|rested|resting|slept|sleeping|hard to begin|hard to start)\b/i;

  const clause = clauses.find((item) => behaviorPattern.test(item));
  const normalized = shortPhrase(clause ?? null, 84);

  if (!normalized) {
    return null;
  }

  if (situation && normalized.toLowerCase() === situation.toLowerCase()) {
    return null;
  }

  return normalized;
}

function inferStructuredStateAnalysis(input: string): StructuredStateAnalysis {
  const emotionLabels = inferEmotionLabels(input);
  const situation = inferSituation(input);
  const behaviorCandidate = inferBehavior(input, situation);
  const behavior = phrasesAreNearDuplicates(behaviorCandidate, situation) ? null : behaviorCandidate;
  const automaticThought = inferAutomaticThought(input, emotionLabels);

  return {
    situation,
    automatic_thought: phrasesAreNearDuplicates(automaticThought, situation) ? null : automaticThought,
    emotion_labels: emotionLabels,
    emotion_intensity: inferIntensityFromAnalysis(input, emotionLabels),
    behavior
  };
}

function buildFallbackFragments(input: string, analysis?: StructuredStateAnalysis): StateFragment[] {
  const normalized = input.toLowerCase();
  const fragments = FRAGMENT_RULES.map((rule) => {
    const evidence = rule.terms.filter((term) => containsTerm(normalized, term));

    if (evidence.length === 0) {
      return null;
    }

    return {
      key: rule.key,
      label: rule.label,
      emoji: rule.emoji,
      evidence
    };
  }).filter((fragment): fragment is StateFragment => fragment !== null);

  if (fragments.length > 0) {
    return fragments.slice(0, 3);
  }

  const emotionFragments = (analysis?.emotion_labels ?? [])
    .filter((label) => label !== "neutral")
    .map((label) => ({
      key: slugify(label),
      label,
      emoji: EMOTION_EMOJIS[label],
      evidence: [label]
    }));

  return emotionFragments.length > 0
    ? emotionFragments.slice(0, 3)
    : [
        {
          key: "fragmented",
          label: "fragmented state",
          emoji: FALLBACK_EMOJI,
          evidence: []
        }
      ];
}

function scoreReason(tags: string[], overlap: string[]) {
  if (overlap.length > 0) {
    return `Shared language with ${overlap.slice(0, 3).join(", ")}.`;
  }

  if (tags.length > 0) {
    return `Closest to ${tags.slice(0, 2).join(", ")}.`;
  }

  return "Weak semantic overlap.";
}

function buildFragmentsFromNode(node: StateNode, evidence: string[] = []): StateFragment[] {
  const tags = node.tags.length > 0 ? node.tags : [node.label];

  return tags.slice(0, 3).map((tag, index) => ({
    key: slugify(tag),
    label: tag,
    emoji: node.emojis[index] ?? node.emojis[0] ?? FALLBACK_EMOJI,
    evidence
  }));
}

function buildScoringQuery(input: string, analysis: StructuredStateAnalysis) {
  return compactText(
    [
      input,
      analysis.situation,
      analysis.automatic_thought,
      analysis.behavior,
      ...analysis.emotion_labels
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function buildRecordTags(fragments: StateFragment[], analysis: StructuredStateAnalysis) {
  return unique(
    [
      ...fragments.flatMap((fragment) => [fragment.key, fragment.label, ...fragment.evidence]),
      ...analysis.emotion_labels,
      ...tokenize(analysis.situation ?? ""),
      ...tokenize(analysis.behavior ?? ""),
      ...tokenize(analysis.automatic_thought ?? "")
    ]
      .map((item) => compactText(item))
      .filter(Boolean)
  ).slice(0, 6);
}

function normalizeStringArray(value: unknown, maxLength: number) {
  return Array.isArray(value)
    ? unique(
        value
          .filter((item): item is string => typeof item === "string")
          .map((item) => compactText(item))
          .filter(Boolean)
      ).slice(0, maxLength)
    : [];
}

function normalizeMatches(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((match) => {
          if (!match || typeof match !== "object") {
            return null;
          }

          const candidate = match as Record<string, unknown>;
          return {
            state_id: typeof candidate.state_id === "string" ? candidate.state_id : "state",
            label: typeof candidate.label === "string" ? compactText(candidate.label) : "state",
            score:
              typeof candidate.score === "number"
                ? Math.max(0, Math.min(1, candidate.score))
                : 0,
            reason:
              typeof candidate.reason === "string"
                ? compactText(candidate.reason)
                : "Similarity score returned by model."
          };
        })
        .filter((match): match is StateMatch => match !== null)
        .sort((a, b) => b.score - a.score)
    : [];
}

function normalizeNewState(value: unknown): NewStateCandidate | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.label !== "string" || typeof candidate.summary !== "string") {
    return null;
  }

  return {
    label: compactText(candidate.label),
    summary: compactText(candidate.summary),
    tags: normalizeStringArray(candidate.tags, 4),
    emojis: normalizeStringArray(candidate.emojis, 3)
  };
}

function normalizeFragments(value: unknown, emojis: string[]) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((fragment) => {
      if (!fragment || typeof fragment !== "object") {
        return null;
      }

      const candidate = fragment as Record<string, unknown>;
      return {
        key: typeof candidate.key === "string" ? slugify(candidate.key) : "fragment",
        label:
          typeof candidate.label === "string"
            ? compactText(candidate.label)
            : "state fragment",
        emoji:
          typeof candidate.emoji === "string"
            ? candidate.emoji
            : emojis[0] ?? FALLBACK_EMOJI,
        evidence: normalizeStringArray(candidate.evidence, 4)
      };
    })
    .filter((fragment): fragment is StateFragment => fragment !== null)
    .slice(0, 3);
}

function normalizeAnalysisRecord(value: Record<string, unknown>, fallbackText: string): StructuredStateAnalysis {
  const sourceText = compactText(
    fallbackText || (typeof value.text === "string" ? value.text : "")
  );
  const inferred = inferStructuredStateAnalysis(sourceText);
  const situation =
    typeof value.situation === "string" ? shortPhrase(value.situation) : inferred.situation;
  const automaticThought =
    typeof value.automatic_thought === "string"
      ? shortPhrase(value.automatic_thought, 96)
      : inferred.automatic_thought;
  const behavior =
    typeof value.behavior === "string" ? shortPhrase(value.behavior, 96) : inferred.behavior;

  return {
    situation,
    automatic_thought: phrasesAreNearDuplicates(automaticThought, situation) ? null : automaticThought,
    emotion_labels: normalizeEmotionLabels(value.emotion_labels ?? inferred.emotion_labels),
    emotion_intensity:
      typeof value.emotion_intensity === "number"
        ? Math.max(0, Math.min(10, Math.round(value.emotion_intensity)))
        : inferred.emotion_intensity,
    behavior: phrasesAreNearDuplicates(behavior, situation) ? null : behavior
  };
}

function stripJsonFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function buildClassificationResult(
  input: string,
  analysis: StructuredStateAnalysis,
  stateNodes: StateNode[],
  source: "anthropic" | "heuristic",
  overrides: ClassificationOverrides = {}
): ClassificationResult {
  const scoringQuery = buildScoringQuery(input, analysis);
  const baseMatches = stateNodes
    .map((node) => scoreStateNode(scoringQuery, node))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const matches = overrides.matches ?? baseMatches;
  const strongestMatch = matches[0] ?? null;
  const explicitNovelty = typeof overrides.isNovel === "boolean" ? overrides.isNovel : undefined;
  const shouldCreateNovelState =
    explicitNovelty ??
    (stateNodes.length > 0 &&
      (strongestMatch === null || strongestMatch.score < NOVELTY_THRESHOLD) &&
      tokenize(scoringQuery).length > 1);
  const matchedNode =
    !shouldCreateNovelState && strongestMatch
      ? stateNodes.find((node) => node.id === strongestMatch.state_id || node.label === strongestMatch.label) ?? null
      : null;
  const newState =
    overrides.newState !== undefined
      ? overrides.newState
      : shouldCreateNovelState
        ? suggestNewState(input, analysis)
        : null;
  const fallbackFragments = buildFallbackFragments(input, analysis);
  const fragments =
    overrides.fragments ??
    (matchedNode !== null
      ? buildFragmentsFromNode(matchedNode, tokenize(scoringQuery).slice(0, 3))
      : newState !== null
        ? buildFragmentsFromNode(buildStateNodeFromCandidate(newState, stateNodes), newState.tags)
        : fallbackFragments);
  const label =
    overrides.label ??
    matchedNode?.label ??
    newState?.label ??
    fragments.map((fragment) => fragment.label).join(", ");
  const emojis = unique(
    (
      overrides.emojis ??
      matchedNode?.emojis ??
      newState?.emojis ??
      fragments.map((fragment) => fragment.emoji)
    ).filter(Boolean)
  ).slice(0, 3);
  const stateKey = overrides.stateKey ?? matchedNode?.id ?? slugify(newState?.label ?? label);
  const tags = overrides.tags ?? buildRecordTags(fragments, analysis);

  return {
    stateKey,
    label,
    emojis,
    fragments: fragments.slice(0, 3),
    record: {
      id: stateKey,
      text: compactText(input),
      timestamp: overrides.timestamp ?? currentDateKey(),
      situation: analysis.situation,
      automatic_thought: analysis.automatic_thought,
      emotion_labels: analysis.emotion_labels,
      emotion_intensity: analysis.emotion_intensity,
      behavior: analysis.behavior,
      alternative_framing:
        overrides.alternativeFraming ?? matchedNode?.summary ?? newState?.summary ?? null,
      tags,
      similar_states: matches.slice(0, 5).map((match) => ({
        state_id: match.state_id,
        score: match.score,
        reason: match.reason
      })),
      is_novel: shouldCreateNovelState
    },
    source,
    matches,
    isNovel: shouldCreateNovelState,
    newState
  };
}

export function buildStateNodeFromCandidate(
  candidate: NewStateCandidate,
  existingNodes: StateNode[]
): StateNode {
  const baseId = slugify(candidate.label);
  let id = baseId;
  let suffix = 2;

  while (existingNodes.some((node) => node.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return {
    id,
    label: compactText(candidate.label),
    summary: compactText(candidate.summary),
    tags: unique(candidate.tags.map((tag) => compactText(tag)).filter(Boolean)).slice(0, 4),
    emojis:
      candidate.emojis && candidate.emojis.length > 0
        ? unique(candidate.emojis).slice(0, 3)
        : [FALLBACK_EMOJI]
  };
}

export function scoreStateNode(input: string, node: StateNode): StateMatch {
  const inputTokens = tokenize(input);
  const stateTokens = unique(
    tokenize(node.label)
      .concat(tokenize(node.summary))
      .concat(node.tags.flatMap((tag) => tokenize(tag)))
  );
  const overlap = stateTokens.filter((token) => inputTokens.includes(token));
  const union = new Set([...inputTokens, ...stateTokens]).size || 1;
  const score = overlap.length === 0 ? 0 : overlap.length / union;

  return {
    state_id: node.id,
    label: node.label,
    score: Number(score.toFixed(3)),
    reason: scoreReason(node.tags, overlap)
  };
}

export function suggestNewState(
  input: string,
  analysis: StructuredStateAnalysis = inferStructuredStateAnalysis(input)
): NewStateCandidate {
  const fragments = buildFallbackFragments(input, analysis);
  const tokens = tokenize(input);
  const emotionTags = analysis.emotion_labels.filter((label) => label !== "neutral");
  const fragmentLabels = unique(
    fragments
      .map((fragment) => fragment.label)
      .filter((value) => value !== "fragmented state")
  );
  const topTokens = tokens.slice(0, 3);
  const labelParts = fragmentLabels.length > 0 ? fragmentLabels : emotionTags;
  const label = labelParts.length > 0 ? labelParts.join(", ") : topTokens.slice(0, 2).join(" ") || "fragmented state";
  const tags = unique(
    [...fragmentLabels, ...emotionTags, ...topTokens].filter(Boolean)
  ).slice(0, 4);
  const emojis = unique(
    [
      ...fragments.map((fragment) => fragment.emoji),
      ...emotionTags.map((label) => EMOTION_EMOJIS[label])
    ].filter(Boolean)
  ).slice(0, 3);

  return {
    label,
    summary:
      analysis.situation !== null
        ? `State around ${analysis.situation}.`
        : tags.length > 0
          ? `State marked by ${tags.join(", ")}.`
          : "State marked by fragmented language and low overlap with existing states.",
    tags: tags.length > 0 ? tags : ["fragmented"],
    emojis: emojis.length > 0 ? emojis : [FALLBACK_EMOJI]
  };
}

export function heuristicClassifyState(
  input: string,
  stateNodes: StateNode[] = []
): ClassificationResult {
  const analysis = inferStructuredStateAnalysis(input);
  return buildClassificationResult(input, analysis, stateNodes, "heuristic");
}

export function parseClassificationResponse(
  text: string,
  stateNodes: StateNode[] = [],
  inputText = ""
): ClassificationResult {
  const cleaned = stripJsonFences(text);
  const parsed = JSON.parse(cleaned) as Record<string, unknown>;
  const recordValue =
    parsed.record && typeof parsed.record === "object"
      ? (parsed.record as Record<string, unknown>)
      : parsed;
  const resolvedInput = compactText(
    inputText || (typeof recordValue.text === "string" ? recordValue.text : "")
  );
  const analysis = normalizeAnalysisRecord(recordValue, resolvedInput);
  const hasMatches = Object.prototype.hasOwnProperty.call(parsed, "matches");
  const hasNewState = Object.prototype.hasOwnProperty.call(parsed, "new_state");
  const hasIsNovel = Object.prototype.hasOwnProperty.call(parsed, "is_novel");
  const normalizedMatches = normalizeMatches(parsed.matches);
  const normalizedNewState = normalizeNewState(parsed.new_state);
  const emojiOverrides = normalizeStringArray(parsed.emojis, 3);
  const fragmentOverrides = normalizeFragments(parsed.fragments, emojiOverrides);
  const tagOverrides = normalizeStringArray(recordValue.tags, 6);
  const result = buildClassificationResult(resolvedInput, analysis, stateNodes, "anthropic", {
    matches: hasMatches ? normalizedMatches : undefined,
    newState: hasNewState ? normalizedNewState : undefined,
    isNovel: hasIsNovel && typeof parsed.is_novel === "boolean" ? parsed.is_novel : undefined,
    label: typeof parsed.label === "string" ? compactText(parsed.label) : undefined,
    stateKey: typeof parsed.stateKey === "string" ? parsed.stateKey : undefined,
    emojis: emojiOverrides.length > 0 ? emojiOverrides : undefined,
    fragments: fragmentOverrides.length > 0 ? fragmentOverrides : undefined,
    alternativeFraming:
      typeof recordValue.alternative_framing === "string"
        ? compactText(recordValue.alternative_framing)
        : undefined,
    timestamp:
      typeof recordValue.timestamp === "string" ? compactText(recordValue.timestamp) : undefined,
    tags: tagOverrides.length > 0 ? tagOverrides : undefined
  });

  return result;
}
