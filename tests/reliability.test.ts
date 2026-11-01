import test from "node:test";
import assert from "node:assert/strict";
import { findSimilarEntries } from "../lib/matching.ts";
import { parseClassificationResponse } from "../lib/state-classification.ts";
import { heuristicClassifyState } from "../lib/state-classification.ts";
import { build_retrieval_query } from "../lib/state-tides-service.ts";
import entries from "../data/journal-entries.json" with { type: "json" };
import stateNodes from "../data/state-nodes.json" with { type: "json" };

test("same-day related records have zero absent days", () => {
  const result = findSimilarEntries("anxious", [
    { id: "first", date: "2026-10-31", text: "anxious" },
    { id: "second", date: "2026-10-31", text: "anxious" }
  ]);
  assert.equal(result.relatedTimeline[0].gapDays, 0);
  assert.equal(result.relatedTimeline[0].hasGapBeforeNext, false);
});

test("classification rejects top-level JSON values that are not objects", () => {
  for (const raw of ["null", "[]", "true", "7", '"note"']) {
    assert.throws(() => parseClassificationResponse(raw, [], "I feel nervous."), /JSON object/);
  }
});

test("generated markers cannot invent a related history for a new note", () => {
  const input = "The hackathon left me bright and brittle.";
  const classification = heuristicClassifyState(input, stateNodes);
  assert.ok(classification.emojis.length > 0);
  const query = build_retrieval_query(input, classification);
  assert.equal(findSimilarEntries(query, entries).topMatches.length, 0);
});

test("explicit emoji in the user's input remains searchable", () => {
  const input = "🫨";
  const classification = heuristicClassifyState(input, stateNodes, { allowNewState: false });
  const query = build_retrieval_query(input, classification);
  assert.ok(query.includes("🫨"));
  assert.ok(findSimilarEntries(query, entries).topMatches.length > 0);
});

test("novelty threshold is strict below 0.38 and retains an exact match at the boundary", () => {
  const terms = Array.from({ length: 50 }, (_, index) => `term${index}`);
  const node = { id: "threshold", label: terms[0], tags: terms, summary: "Boundary fixture", emojis: ["🙂"] };
  for (const [hits, novel] of [[18, true], [19, false], [20, false]] as const) {
    const result = heuristicClassifyState(terms.slice(0, hits).join(" "), [node]);
    assert.equal(result.matches[0].score, hits / 50);
    assert.equal(result.isNovel, novel);
  }
});
