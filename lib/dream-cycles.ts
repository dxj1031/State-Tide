import { findSimilarEntries, tokenize, type JournalEntry } from "./matching.ts";
import type {
  DreamAbstractionLevel,
  DreamCycleCandidate,
  DreamOutputMode
} from "./dream-types.ts";

const ABSTRACT_TERMS = new Set([
  "anxious",
  "blank",
  "clear",
  "detached",
  "distant",
  "drained",
  "drift",
  "empty",
  "far",
  "flat",
  "fragmented",
  "heavy",
  "low",
  "nervous",
  "restless",
  "settled",
  "slowed",
  "steady",
  "uncertain"
]);

const CONCRETE_TERMS = new Set([
  "afternoon",
  "answered",
  "calls",
  "dawn",
  "errands",
  "evening",
  "lines",
  "meal",
  "midnight",
  "morning",
  "night",
  "notes",
  "paragraph",
  "reading",
  "task",
  "tasks",
  "tea",
  "work",
  "working"
]);

function parseDate(date: string) {
  return new Date(`${date}T00:00:00`);
}

function daysBetween(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / 86400000);
}

function sortedEntries(entries: JournalEntry[]) {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

function dateRange(entries: JournalEntry[]) {
  const sorted = sortedEntries(entries);
  return {
    startDate: sorted[0]?.date ?? "",
    endDate: sorted.at(-1)?.date ?? ""
  };
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function topRepeatedTokens(entries: JournalEntry[]) {
  const counts = new Map<string, number>();

  for (const entry of entries) {
    for (const token of tokenize(entry.text)) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function buildManualCycle(entries: JournalEntry[]): DreamCycleCandidate | null {
  if (entries.length === 0) {
    return null;
  }

  const range = dateRange(entries);

  return {
    id: `manual-${range.startDate}-${range.endDate}`,
    type: "manual",
    label: "Manual incubation range",
    rationale: `Selected ${entries.length} source fragments between ${range.startDate} and ${range.endDate}.`,
    startDate: range.startDate,
    endDate: range.endDate,
    entryIds: sortedEntries(entries).map((entry) => entry.id),
    score: Math.min(1, entries.length / 6)
  };
}

function buildRecurrenceCycle(entries: JournalEntry[]): DreamCycleCandidate | null {
  const [topToken] = topRepeatedTokens(entries);

  if (!topToken) {
    return null;
  }

  const query = topRepeatedTokens(entries)
    .slice(0, 4)
    .map(([token]) => token)
    .join(" ");
  const related = findSimilarEntries(query, entries).relatedTimeline;

  if (related.length < 3) {
    return null;
  }

  const range = dateRange(related);

  return {
    id: `recurrence-${topToken[0]}-${range.startDate}-${range.endDate}`,
    type: "recurrence",
    label: "Strongest recurrence",
    rationale: `Recommended because "${topToken[0]}" and related language recur ${related.length} times across ${daysBetween(range.startDate, range.endDate)} days.`,
    startDate: range.startDate,
    endDate: range.endDate,
    entryIds: related.map((entry) => entry.id),
    score: Math.min(1, 0.42 + related.length / 10)
  };
}

function buildGapCycle(entries: JournalEntry[]): DreamCycleCandidate | null {
  const sorted = sortedEntries(entries);
  let selected: { left: JournalEntry; right: JournalEntry; gapDays: number } | null = null;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index];
    const right = sorted[index + 1];
    const gapDays = daysBetween(left.date, right.date) - 1;
    const sharedTokens = tokenize(left.text).filter((token) => tokenize(right.text).includes(token));
    const sharedMarkers = (left.markers ?? []).filter((marker) => (right.markers ?? []).includes(marker));

    if (gapDays > 0 && (sharedTokens.length > 0 || sharedMarkers.length > 0)) {
      if (!selected || gapDays > selected.gapDays) {
        selected = { left, right, gapDays };
      }
    }
  }

  if (!selected) {
    return null;
  }

  return {
    id: `gap-${selected.left.id}-${selected.right.id}`,
    type: "gap",
    label: "Longest meaningful gap",
    rationale: `Recommended because a related state disappears for ${selected.gapDays} days before returning.`,
    startDate: selected.left.date,
    endDate: selected.right.date,
    entryIds: [selected.left.id, selected.right.id],
    score: Math.min(1, 0.45 + selected.gapDays / 90)
  };
}

function buildTransformationCycle(entries: JournalEntry[]): DreamCycleCandidate | null {
  const recurring = buildRecurrenceCycle(entries);

  if (!recurring) {
    return null;
  }

  const relatedEntries = recurring.entryIds
    .map((id) => entries.find((entry) => entry.id === id))
    .filter((entry): entry is JournalEntry => entry !== undefined);
  const actionCount = unique(relatedEntries.map((entry) => entry.next_action).filter(Boolean)).length;

  if (actionCount < 2) {
    return null;
  }

  return {
    ...recurring,
    id: `transformation-${recurring.startDate}-${recurring.endDate}`,
    type: "transformation",
    label: "Response transformation",
    rationale: `Recommended because similar states have ${actionCount} different next actions, showing response variation inside one tide.`,
    score: Math.min(1, recurring.score + actionCount / 12)
  };
}

export function recommendDreamCycles(entries: JournalEntry[]) {
  return unique(
    [
      buildRecurrenceCycle(entries),
      buildGapCycle(entries),
      buildTransformationCycle(entries)
    ].filter((cycle): cycle is DreamCycleCandidate => cycle !== null)
  )
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function buildManualDreamCycle(entries: JournalEntry[]) {
  return buildManualCycle(entries);
}

export function entriesForCycle(entries: JournalEntry[], cycle: DreamCycleCandidate) {
  const entryIds = new Set(cycle.entryIds);
  return sortedEntries(entries).filter((entry) => entryIds.has(entry.id));
}

export function classifyDreamAbstraction(entries: JournalEntry[]): DreamAbstractionLevel {
  const tokens = entries.flatMap((entry) => tokenize(entry.text));
  const abstractScore = tokens.filter((token) => ABSTRACT_TERMS.has(token)).length;
  const concreteScore = tokens.filter((token) => CONCRETE_TERMS.has(token)).length;

  if (abstractScore - concreteScore >= 3) {
    return "abstract";
  }

  if (concreteScore - abstractScore >= 2) {
    return "concrete";
  }

  return "balanced";
}

export function suggestedModeForAbstraction(level: DreamAbstractionLevel): DreamOutputMode {
  if (level === "abstract") {
    return "music";
  }

  if (level === "concrete") {
    return "image";
  }

  return "text";
}
