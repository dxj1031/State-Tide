import { tokenize } from "./matching.ts";

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
  emotion_labels: string[];
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

const FALLBACK_EMOJI = "\u{1FAE8}";
const NOVELTY_THRESHOLD = 0.42;

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
    terms: ["slowed", "slow", "heavy", "stalled", "hard", "begin", "stuck", "exhausted", "drained"]
  },
  {
    key: "overwhelmed",
    label: "overwhelmed",
    emoji: "\u{1F635}",
    terms: ["flooded", "overwhelmed", "too", "much", "surge", "crowded", "spinning"]
  },
  {
    key: "clear",
    label: "clear",
    emoji: "\u{1F642}",
    terms: ["clear", "steady", "settled", "normal", "held", "order", "okay"]
  }
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

function buildFallbackFragments(input: string): StateFragment[] {
  const normalized = input.toLowerCase();

  const fragments = FRAGMENT_RULES.map((rule) => {
    const evidence = rule.terms.filter((term) => normalized.includes(term));

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

  return fragments.length > 0
    ? fragments.slice(0, 3)
    : [
        {
          key: "fragmented",
          label: "fragmented state",
          emoji: FALLBACK_EMOJI,
          evidence: []
        }
      ];
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function firstClause(input: string) {
  const clause = input
    .split(/[.!?]/)
    .map((part) => compactText(part))
    .find(Boolean);

  return clause ?? null;
}

function inferAutomaticThought(input: string) {
  const clauses = input
    .split(/[.!?]/)
    .map((part) => compactText(part))
    .filter(Boolean);

  return (
    clauses.find((clause) => /hard to|unable|can't|cannot|won't|stuck|same lines|never/i.test(clause)) ??
    null
  );
}

function inferBehavior(input: string) {
  const clauses = input
    .split(/[.!?]/)
    .map((part) => compactText(part))
    .filter(Boolean);

  return (
    clauses.find((clause) =>
      /reading|scrolling|avoiding|stayed|paced|loop|unfinished|begin|finish|called|slept/i.test(clause)
    ) ?? null
  );
}

function inferIntensity(fragments: StateFragment[]) {
  const keys = fragments.map((fragment) => fragment.key);

  if (keys.includes("overwhelmed")) {
    return 8;
  }

  if (keys.includes("restless") || keys.includes("drained")) {
    return 7;
  }

  if (keys.includes("detached")) {
    return 6;
  }

  if (keys.includes("clear")) {
    return 3;
  }

  return 5;
}

function buildStateRecord(
  input: string,
  stateKey: string,
  fragments: StateFragment[],
  matches: StateMatch[],
  isNovel: boolean,
  alternativeFraming: string | null
): InferredStateRecord {
  const tags = unique(
    fragments
      .flatMap((fragment) => [fragment.key, fragment.label, ...fragment.evidence])
      .map((item) => compactText(item))
      .filter(Boolean)
  ).slice(0, 6);

  return {
    id: stateKey,
    text: compactText(input),
    timestamp: currentDateKey(),
    situation: firstClause(input),
    automatic_thought: inferAutomaticThought(input),
    emotion_labels: unique(fragments.map((fragment) => fragment.label)).slice(0, 4),
    emotion_intensity: inferIntensity(fragments),
    behavior: inferBehavior(input),
    alternative_framing: alternativeFraming,
    tags,
    similar_states: matches.slice(0, 5).map((match) => ({
      state_id: match.state_id,
      score: match.score,
      reason: match.reason
    })),
    is_novel: isNovel
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

export function suggestNewState(input: string): NewStateCandidate {
  const fragments = buildFallbackFragments(input);
  const tokens = tokenize(input);
  const topTokens = tokens.slice(0, 3);
  const fragmentLabels = unique(fragments.map((fragment) => fragment.label));
  const label =
    fragmentLabels.length > 0 && fragmentLabels[0] !== "fragmented state"
      ? fragmentLabels.join(", ")
      : topTokens.slice(0, 2).join(" ") || "fragmented state";
  const tags = unique(
    [...fragmentLabels.filter((value) => value !== "fragmented state"), ...topTokens].filter(Boolean)
  ).slice(0, 4);

  return {
    label,
    summary:
      tags.length > 0
        ? `State marked by ${tags.join(", ")}.`
        : "State marked by fragmented language and low overlap with existing states.",
    tags: tags.length > 0 ? tags : ["fragmented"],
    emojis: unique(fragments.map((fragment) => fragment.emoji)).slice(0, 3)
  };
}

export function heuristicClassifyState(
  input: string,
  stateNodes: StateNode[] = []
): ClassificationResult {
  const matches = stateNodes
    .map((node) => scoreStateNode(input, node))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  const strongestMatch = matches[0] ?? null;
  const fallbackFragments = buildFallbackFragments(input);
  const shouldCreateNovelState =
    stateNodes.length > 0 &&
    (strongestMatch === null || strongestMatch.score < NOVELTY_THRESHOLD) &&
    tokenize(input).length > 1;
  const newState = shouldCreateNovelState ? suggestNewState(input) : null;
  const matchedNode =
    !shouldCreateNovelState && strongestMatch
      ? stateNodes.find((node) => node.id === strongestMatch.state_id) ?? null
      : null;

  const label = matchedNode?.label ?? newState?.label ?? fallbackFragments.map((fragment) => fragment.label).join(", ");
  const emojis =
    matchedNode?.emojis ??
    newState?.emojis ??
    fallbackFragments.map((fragment) => fragment.emoji);
  const fragments =
    matchedNode !== null
      ? buildFragmentsFromNode(matchedNode, tokenize(input).slice(0, 3))
      : newState !== null
        ? buildFragmentsFromNode(buildStateNodeFromCandidate(newState, stateNodes), newState.tags)
        : fallbackFragments;
  const stateKey = matchedNode?.id ?? slugify(newState?.label ?? label);
  const record = buildStateRecord(
    input,
    stateKey,
    fragments,
    matches,
    shouldCreateNovelState,
    matchedNode?.summary ?? newState?.summary ?? null
  );

  return {
    stateKey,
    label,
    emojis: emojis.slice(0, 3),
    fragments,
    record,
    source: "heuristic",
    matches,
    isNovel: shouldCreateNovelState,
    newState
  };
}

export function parseClassificationResponse(
  text: string,
  stateNodes: StateNode[] = []
): ClassificationResult {
  const parsed = JSON.parse(text) as {
    record?: unknown;
    matches?: unknown;
    is_novel?: unknown;
    new_state?: unknown;
    stateKey?: unknown;
    label?: unknown;
    emojis?: unknown;
    fragments?: unknown;
  };

  const matches = Array.isArray(parsed.matches)
    ? parsed.matches
        .map((match) => {
          if (!match || typeof match !== "object") {
            return null;
          }

          const candidate = match as Record<string, unknown>;
          return {
            state_id: typeof candidate.state_id === "string" ? candidate.state_id : "state",
            label: typeof candidate.label === "string" ? candidate.label : "state",
            score:
              typeof candidate.score === "number"
                ? Math.max(0, Math.min(1, candidate.score))
                : 0,
            reason:
              typeof candidate.reason === "string"
                ? candidate.reason
                : "Similarity score returned by model."
          };
        })
        .filter((match): match is StateMatch => match !== null)
        .sort((a, b) => b.score - a.score)
    : [];

  const newStateRaw =
    parsed.new_state && typeof parsed.new_state === "object"
      ? (parsed.new_state as Record<string, unknown>)
      : null;
  const newState =
    newStateRaw &&
    typeof newStateRaw.label === "string" &&
    typeof newStateRaw.summary === "string" &&
    Array.isArray(newStateRaw.tags)
      ? {
          label: newStateRaw.label,
          summary: newStateRaw.summary,
          tags: newStateRaw.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 4),
          emojis: Array.isArray(newStateRaw.emojis)
            ? newStateRaw.emojis.filter((emoji): emoji is string => typeof emoji === "string").slice(0, 3)
            : undefined
        }
      : null;

  const bestMatch = matches[0] ?? null;
  const matchedNode =
    bestMatch !== null
      ? stateNodes.find((node) => node.id === bestMatch.state_id || node.label === bestMatch.label) ?? null
      : null;
  const isNovel =
    typeof parsed.is_novel === "boolean"
      ? parsed.is_novel
      : newState !== null || (bestMatch !== null && bestMatch.score < NOVELTY_THRESHOLD);
  const fallback = heuristicClassifyState("", stateNodes);
  const emojis =
    Array.isArray(parsed.emojis) && parsed.emojis.length > 0
      ? parsed.emojis.filter((item): item is string => typeof item === "string").slice(0, 3)
      : matchedNode?.emojis ?? newState?.emojis ?? fallback.emojis;
  const fragments = Array.isArray(parsed.fragments)
    ? parsed.fragments
        .map((fragment) => {
          if (!fragment || typeof fragment !== "object") {
            return null;
          }

          const candidate = fragment as Record<string, unknown>;
          return {
            key: typeof candidate.key === "string" ? candidate.key : "fragment",
            label: typeof candidate.label === "string" ? candidate.label : "state fragment",
            emoji: typeof candidate.emoji === "string" ? candidate.emoji : emojis[0] ?? FALLBACK_EMOJI,
            evidence: Array.isArray(candidate.evidence)
              ? candidate.evidence.filter((item): item is string => typeof item === "string")
              : []
          };
        })
        .filter((fragment): fragment is StateFragment => fragment !== null)
    : matchedNode
      ? buildFragmentsFromNode(matchedNode)
      : newState
        ? buildFragmentsFromNode(buildStateNodeFromCandidate(newState, stateNodes), newState.tags)
        : fallback.fragments;
  const stateKey =
    typeof parsed.stateKey === "string"
      ? parsed.stateKey
      : matchedNode?.id ??
        slugify(newState?.label ?? (typeof parsed.label === "string" ? parsed.label : fallback.label));
  const recordRaw = parsed.record && typeof parsed.record === "object"
    ? (parsed.record as Record<string, unknown>)
    : null;
  const record =
    recordRaw
      ? {
          id: typeof recordRaw.id === "string" ? recordRaw.id : stateKey,
          text: typeof recordRaw.text === "string" ? recordRaw.text : "",
          timestamp:
            typeof recordRaw.timestamp === "string" ? recordRaw.timestamp : currentDateKey(),
          situation:
            typeof recordRaw.situation === "string" ? recordRaw.situation : null,
          automatic_thought:
            typeof recordRaw.automatic_thought === "string" ? recordRaw.automatic_thought : null,
          emotion_labels: Array.isArray(recordRaw.emotion_labels)
            ? recordRaw.emotion_labels.filter((item): item is string => typeof item === "string").slice(0, 4)
            : fragments.map((fragment) => fragment.label),
          emotion_intensity:
            typeof recordRaw.emotion_intensity === "number"
              ? Math.max(0, Math.min(10, Math.round(recordRaw.emotion_intensity)))
              : inferIntensity(fragments),
          behavior: typeof recordRaw.behavior === "string" ? recordRaw.behavior : null,
          alternative_framing:
            typeof recordRaw.alternative_framing === "string"
              ? recordRaw.alternative_framing
              : matchedNode?.summary ?? newState?.summary ?? null,
          tags: Array.isArray(recordRaw.tags)
            ? recordRaw.tags.filter((item): item is string => typeof item === "string").slice(0, 6)
            : unique(fragments.map((fragment) => fragment.label)),
          similar_states: Array.isArray(recordRaw.similar_states)
            ? recordRaw.similar_states
                .map((item) => {
                  if (!item || typeof item !== "object") {
                    return null;
                  }

                  const candidate = item as Record<string, unknown>;
                  return {
                    state_id:
                      typeof candidate.state_id === "string" ? candidate.state_id : "state",
                    score:
                      typeof candidate.score === "number"
                        ? Math.max(0, Math.min(1, candidate.score))
                        : 0,
                    reason:
                      typeof candidate.reason === "string" ? candidate.reason : "Model similarity."
                  };
                })
                .filter(
                  (
                    item
                  ): item is { state_id: string; score: number; reason: string } => item !== null
                )
                .slice(0, 5)
            : matches.slice(0, 5).map((match) => ({
                state_id: match.state_id,
                score: match.score,
                reason: match.reason
              })),
          is_novel: isNovel
        }
      : buildStateRecord(
          "",
          stateKey,
          fragments,
          matches,
          isNovel,
          matchedNode?.summary ?? newState?.summary ?? null
        );

  return {
    stateKey,
    label:
      typeof parsed.label === "string"
        ? parsed.label
        : matchedNode?.label ?? newState?.label ?? fallback.label,
    emojis,
    fragments: fragments.slice(0, 3),
    record,
    source: "anthropic",
    matches,
    isNovel,
    newState
  };
}
