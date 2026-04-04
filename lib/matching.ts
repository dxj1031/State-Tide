export type JournalEntry = {
  id: string;
  date: string;
  text: string;
  markers?: string[];
  next_action?: string;
};

export type RelatedEntry = JournalEntry & {
  score: number;
  overlap: string[];
  emojiOverlap: string[];
  nextRelatedDate: string | null;
  gapDays: number | null;
  hasGapBeforeNext: boolean;
  daysWithoutRelatedAfter: number | null;
  hasTrailingAbsence: boolean;
};

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "hard",
  "i",
  "in",
  "is",
  "it",
  "little",
  "no",
  "not",
  "of",
  "on",
  "or",
  "same",
  "the",
  "to",
  "today",
  "with"
]);

function normalizeToken(token: string) {
  return token.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function extractEmoji(text: string) {
  return Array.from(new Set(text.match(/\p{Extended_Pictographic}/gu) ?? []));
}

export function tokenize(text: string) {
  return Array.from(
    new Set(
      text
        .split(/\s+/)
        .map(normalizeToken)
        .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
    )
  );
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.round((endDate.getTime() - startDate.getTime()) / millisecondsPerDay);
}

export function findSimilarEntries(query: string, entries: JournalEntry[]) {
  const queryTokens = tokenize(query);
  const queryEmoji = extractEmoji(query);

  if (queryTokens.length === 0 && queryEmoji.length === 0) {
    return {
      topMatches: [] as RelatedEntry[],
      relatedTimeline: [] as RelatedEntry[]
    };
  }

  const scored = entries
    .map((entry) => {
      const entryTokens = tokenize(entry.text);
      const entryEmoji = entry.markers ?? [];
      const overlap = entryTokens.filter((token) => queryTokens.includes(token));
      const emojiOverlap = entryEmoji.filter((marker) => queryEmoji.includes(marker));
      const unionSize = new Set([
        ...queryTokens,
        ...entryTokens,
        ...queryEmoji,
        ...entryEmoji
      ]).size;
      const overlapCount = overlap.length + emojiOverlap.length * 1.5;
      const score = overlapCount === 0 ? 0 : overlapCount / unionSize;

      return {
        ...entry,
        score,
        overlap,
        emojiOverlap
      };
    })
    .filter((entry) => entry.overlap.length > 0 || entry.emojiOverlap.length > 0);

  const relatedByDate = [...scored].sort((a, b) => a.date.localeCompare(b.date));
  const datasetEndDate = [...entries]
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)?.date;

  const relatedTimeline = relatedByDate.map((entry, index) => {
    const next = relatedByDate[index + 1];
    const gapDays = next ? daysBetween(entry.date, next.date) - 1 : null;
    const daysWithoutRelatedAfter =
      !next && datasetEndDate ? daysBetween(entry.date, datasetEndDate) : null;

    return {
      ...entry,
      nextRelatedDate: next?.date ?? null,
      gapDays,
      hasGapBeforeNext: gapDays !== null && gapDays > 0,
      daysWithoutRelatedAfter,
      hasTrailingAbsence: daysWithoutRelatedAfter !== null && daysWithoutRelatedAfter > 0
    };
  });

  const timelineLookup = new Map(relatedTimeline.map((entry) => [entry.id, entry]));

  const topMatches = [...scored]
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return b.date.localeCompare(a.date);
    })
    .slice(0, 3)
    .map((entry) => timelineLookup.get(entry.id) as RelatedEntry);

  return {
    topMatches,
    relatedTimeline
  };
}
