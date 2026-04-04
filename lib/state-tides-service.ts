import { findSimilarEntries, type JournalEntry, type RelatedEntry } from "./matching.ts";
import type { ClassificationResult } from "./state-classification.ts";

export type TimelineResponse = {
  topMatches: RelatedEntry[];
  relatedTimeline: RelatedEntry[];
};

export type RelatednessNode = {
  id: string;
  type: "center" | "tag" | "note" | "pattern";
  label: string;
  score: number;
  x: number;
  y: number;
  size: number;
  opacity: number;
  date?: string;
  text?: string;
};

export type RelatednessEdge = {
  id: string;
  source: string;
  target: string;
  weight: number;
};

export type RelatednessGraph = {
  nodes: RelatednessNode[];
  edges: RelatednessEdge[];
};

export function find_similar_entries(query: string, entries: JournalEntry[]) {
  return findSimilarEntries(query, entries).topMatches;
}

export function compute_gaps(entries: RelatedEntry[]) {
  return entries.map((entry) => ({
    id: entry.id,
    date: entry.date,
    nextRelatedDate: entry.nextRelatedDate,
    gapDays: entry.gapDays,
    hasGapBeforeNext: entry.hasGapBeforeNext,
    daysWithoutRelatedAfter: entry.daysWithoutRelatedAfter,
    hasTrailingAbsence: entry.hasTrailingAbsence
  }));
}

export function retrieve_timeline(query: string, entries: JournalEntry[]): TimelineResponse {
  return findSimilarEntries(query, entries);
}

export function build_relatedness_graph(
  inputText: string,
  classification: ClassificationResult | null,
  topMatches: RelatedEntry[],
  relatedTimeline: RelatedEntry[]
): RelatednessGraph {
  const center: RelatednessNode = {
    id: "current-note",
    type: "center",
    label: "Current note",
    score: 1,
    x: 50,
    y: 50,
    size: 26,
    opacity: 1,
    text: inputText
  };

  const semanticSeeds = [
    ...(classification?.record.emotion_labels.map((label, index) => ({
      key: `emotion-${label}`,
      label,
      text: `Emotion intensity ${classification.record.emotion_intensity}/10`,
      score: Math.max(0.44, 0.84 - index * 0.1)
    })) ?? []),
    ...(classification?.record.tags.slice(0, 3).map((tag, index) => ({
      key: `tag-${tag}`,
      label: tag,
      text: "Inferred state tag",
      score: Math.max(0.34, 0.72 - index * 0.09)
    })) ?? []),
    ...(classification?.matches.slice(0, 2).map((match) => ({
      key: `state-${match.state_id}`,
      label: match.label,
      text: match.reason,
      score: Math.max(0.24, match.score)
    })) ?? [])
  ].slice(0, 5);

  const tagNodes: RelatednessNode[] = semanticSeeds.map((seed, index) => {
    const radius = 20 + index * 6;
    const angle = -130 + index * 48;

    return {
      id: `tag-${seed.key}`,
      type: "tag",
      label: seed.label,
      score: seed.score,
      x: 50 + Math.cos((angle * Math.PI) / 180) * radius,
      y: 50 + Math.sin((angle * Math.PI) / 180) * radius,
      size: 14 + seed.score * 18,
      opacity: 0.46 + seed.score * 0.42,
      text: seed.text
    };
  });

  const noteNodes: RelatednessNode[] = topMatches.map((match, index) => {
    const score = Math.max(0.32, match.score);
    const radius = 23 + index * 11;
    const angle = 10 + index * 38;

    return {
      id: `note-${match.id}`,
      type: "note",
      label: match.date,
      score,
      x: 50 + Math.cos((angle * Math.PI) / 180) * radius,
      y: 50 + Math.sin((angle * Math.PI) / 180) * radius,
      size: 14 + score * 20,
      opacity: 0.32 + score * 0.56,
      date: match.date,
      text: match.text
    };
  });

  const longestGap = relatedTimeline.reduce(
    (current, entry) => Math.max(current, entry.gapDays ?? entry.daysWithoutRelatedAfter ?? 0),
    0
  );

  const patternNodes: RelatednessNode[] = [
    ...(classification?.record.situation
      ? [
          {
            id: "pattern-trigger",
            type: "pattern" as const,
            label: "trigger",
            score: 0.58,
            x: 22,
            y: 24,
            size: 16,
            opacity: 0.58,
            text: classification.record.situation
          }
        ]
      : []),
    ...(classification?.record.behavior
      ? [
          {
            id: "pattern-behavior",
            type: "pattern" as const,
            label: "behavior",
            score: 0.54,
            x: 78,
            y: 24,
            size: 16,
            opacity: 0.56,
            text: classification.record.behavior
          }
        ]
      : []),
    {
      id: "pattern-recurrence",
      type: "pattern",
      label: "recurrence",
      score: 0.68,
      x: 24,
      y: 79,
      size: 17,
      opacity: 0.7,
      text: `${relatedTimeline.length} related appearances`
    },
    {
      id: "pattern-gap",
      type: "pattern",
      label: "gap",
      score: Math.max(0.42, Math.min(0.86, longestGap / 20)),
      x: 76,
      y: 79,
      size: 15 + Math.max(0.42, Math.min(0.86, longestGap / 20)) * 8,
      opacity: 0.5 + Math.max(0.42, Math.min(0.86, longestGap / 20)) * 0.35,
      text: `Longest gap: ${longestGap} days`
    }
  ];

  const nodes = [center, ...tagNodes, ...noteNodes, ...patternNodes];
  const edges = nodes
    .filter((node) => node.id !== center.id)
    .map((node) => ({
      id: `edge-${center.id}-${node.id}`,
      source: center.id,
      target: node.id,
      weight: node.score
    }));

  return { nodes, edges };
}

