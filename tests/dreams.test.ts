import test from "node:test";
import assert from "node:assert/strict";
import entries from "../data/journal-entries.json" with { type: "json" };
import {
  buildManualDreamCycle,
  classifyDreamAbstraction,
  recommendDreamCycles,
  suggestedModeForAbstraction
} from "../lib/dream-cycles.ts";
import { buildDreamSeed, estimateDreamTokens } from "../lib/dream-prompt.ts";
import {
  DEFAULT_GENERATION_SETTINGS,
  DEFAULT_STYLE_MEMORY
} from "../lib/dream-types.ts";
import type { JournalEntry } from "../lib/matching.ts";

const journalEntries = entries as JournalEntry[];

test("dream cycle recommendations include bounded smart candidates", () => {
  const cycles = recommendDreamCycles(journalEntries);

  assert.ok(cycles.length > 0);
  assert.ok(cycles.length <= 3);
  assert.ok(cycles.every((cycle) => cycle.entryIds.length > 0));
});

test("manual dream cycle preserves selected source fragments", () => {
  const selected = journalEntries.slice(0, 3);
  const cycle = buildManualDreamCycle(selected);

  assert.ok(cycle);
  assert.equal(cycle?.type, "manual");
  assert.deepEqual(cycle?.entryIds, selected.map((entry) => entry.id));
});

test("dream abstraction maps to a stable output mode", () => {
  const level = classifyDreamAbstraction(journalEntries);
  const mode = suggestedModeForAbstraction(level);

  assert.ok(["abstract", "balanced", "concrete"].includes(level));
  assert.ok(["text", "image", "music"].includes(mode));
});

test("token estimate is concrete and labeled", () => {
  const cycle = buildManualDreamCycle(journalEntries.slice(0, 4));

  assert.ok(cycle);
  const estimate = estimateDreamTokens(journalEntries.slice(0, 4), cycle!, "music", DEFAULT_STYLE_MEMORY);

  assert.ok(estimate.estimatedTokens > 0);
  assert.ok(["Low", "Medium", "High"].includes(estimate.level));
});

test("dream seed keeps an imagery cluster and source cycle", () => {
  const sourceEntries = journalEntries.slice(0, 4);
  const cycle = buildManualDreamCycle(sourceEntries);

  assert.ok(cycle);
  const seed = buildDreamSeed({
    cycle: cycle!,
    sourceEntries,
    mode: "text",
    styleMemory: DEFAULT_STYLE_MEMORY,
    settings: DEFAULT_GENERATION_SETTINGS
  });

  assert.equal(seed.cycle.id, cycle?.id);
  assert.ok(seed.imageryCluster.length > 0);
  assert.deepEqual(seed.sourceEntryIds, sourceEntries.map((entry) => entry.id));
});
