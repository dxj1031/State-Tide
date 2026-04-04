import test from "node:test";
import assert from "node:assert/strict";
import entries from "../data/journal-entries.json" with { type: "json" };
import stateNodes from "../data/state-nodes.json" with { type: "json" };
import { extractEmoji, findSimilarEntries, tokenize } from "../lib/matching.ts";
import {
  buildStateNodeFromCandidate,
  heuristicClassifyState,
  parseClassificationResponse
} from "../lib/state-classification.ts";
import {
  build_relatedness_graph,
  compute_gaps,
  find_similar_entries,
  retrieve_timeline
} from "../lib/state-tides-service.ts";

test("tokenize removes punctuation and common filler words", () => {
  assert.deepEqual(tokenize("Detached, and restless at night."), [
    "detached",
    "restless",
    "night"
  ]);
});

test("extractEmoji returns distinct emoji markers from input", () => {
  assert.deepEqual(extractEmoji("\u{1F636} detached \u{1FAE8} \u{1F636}"), ["😶", "🫨"]);
});

test("findSimilarEntries returns top matches with gaps and timestamps", () => {
  const result = findSimilarEntries(
    "Detached again tonight. Restless, slowed, hard to begin anything.",
    entries
  );

  assert.equal(result.topMatches.length, 3);
  assert.equal(result.topMatches[0].date, "2025-04-07");
  assert.ok(result.topMatches.every((entry) => entry.score > 0));
  assert.ok(result.relatedTimeline.some((entry) => entry.hasGapBeforeNext));
});

test("emoji input can drive matching", () => {
  const result = findSimilarEntries("\u{1F636} \u{1FAE8}", entries);

  assert.equal(result.topMatches.length, 3);
  assert.ok(result.topMatches[0].emojiOverlap.length > 0);
});

test("heuristic classification organizes fragments for a fragmented note", () => {
  const result = heuristicClassifyState("Detached and restless, hard to begin.", stateNodes);

  assert.ok(result.emojis.length > 0);
  assert.ok(result.fragments.length > 0);
  assert.ok(result.matches.length > 0);
  assert.ok(result.record.emotion_labels.length > 0);
  assert.equal(typeof result.record.emotion_intensity, "number");
  assert.equal(result.source, "heuristic");
});

test("parseClassificationResponse reads structured similarity JSON", () => {
  const result = parseClassificationResponse(
    '{"record":{"id":"detached-restless","text":"Detached and restless, hard to begin.","timestamp":"2026-04-04","situation":"Detached and restless","automatic_thought":"hard to begin","emotion_labels":["detached","restless"],"emotion_intensity":7,"behavior":"hard to begin","alternative_framing":"Distance and drift have appeared before.","tags":["detached","restless"],"similar_states":[{"state_id":"detached-restless","score":0.83,"reason":"Shared language with detached and restless."}],"is_novel":false},"matches":[{"state_id":"detached-restless","label":"detached, restless","score":0.83,"reason":"Shared language with detached and restless."}],"is_novel":false,"new_state":null}',
    stateNodes
  );

  assert.equal(result.stateKey, "detached-restless");
  assert.equal(result.label, "detached, restless");
  assert.equal(result.matches[0]?.score, 0.83);
  assert.equal(result.record.situation, "Detached and restless");
  assert.equal(result.isNovel, false);
});

test("state tides service exposes MCP-shaped timeline functions", () => {
  const topMatches = find_similar_entries("detached restless slowed", entries);
  const timeline = retrieve_timeline("detached restless slowed", entries);
  const gaps = compute_gaps(timeline.relatedTimeline);

  assert.equal(topMatches.length, 3);
  assert.ok(timeline.relatedTimeline.length >= topMatches.length);
  assert.equal(gaps.length, timeline.relatedTimeline.length);
});

test("relatedness graph centers the current note and adds surrounding nodes", () => {
  const classification = heuristicClassifyState("Detached and restless, hard to begin.", stateNodes);
  const timeline = retrieve_timeline("detached restless slowed", entries);
  const graph = build_relatedness_graph(
    "Detached and restless, hard to begin.",
    classification,
    timeline.topMatches,
    timeline.relatedTimeline
  );

  assert.equal(graph.nodes[0]?.id, "current-note");
  assert.ok(graph.nodes.some((node) => node.type === "tag"));
  assert.ok(graph.nodes.some((node) => node.type === "note"));
  assert.ok(graph.edges.length >= graph.nodes.length - 1);
});

test("heuristic classification creates a novel state when overlap is weak", () => {
  const result = heuristicClassifyState(
    "Bright, brittle, ceremonial focus with static under it.",
    stateNodes
  );

  assert.equal(result.isNovel, true);
  assert.ok(result.newState);
  assert.ok(result.newState?.tags.length);

  const newNode = buildStateNodeFromCandidate(result.newState!, stateNodes);
  assert.ok(newNode.id.length > 0);
});

test("findSimilarEntries reports trailing absence after the last related entry", () => {
  const result = findSimilarEntries("fragmented restless slowed detached", entries);
  const lastRelated = result.relatedTimeline.at(-1);

  assert.ok(lastRelated);
  assert.equal(lastRelated?.date, "2026-03-18");
  assert.equal(lastRelated?.nextRelatedDate, null);
  assert.equal(lastRelated?.daysWithoutRelatedAfter, 0);
  assert.equal(lastRelated?.hasTrailingAbsence, false);

  const earlierLast = findSimilarEntries("distant paragraph", entries).relatedTimeline.at(-1);

  assert.ok(earlierLast);
  assert.equal(earlierLast?.date, "2025-10-22");
  assert.equal(earlierLast?.nextRelatedDate, null);
  assert.ok((earlierLast?.daysWithoutRelatedAfter ?? 0) > 0);
  assert.equal(earlierLast?.hasTrailingAbsence, true);
});

test("historical matches retain next_action for comparison flow", () => {
  const result = findSimilarEntries("Detached again tonight. Restless, slowed, hard to begin anything.", entries);

  assert.ok(entries.some((entry) => typeof entry.next_action === "string"));
  assert.ok(result.topMatches.some((entry) => typeof entry.next_action === "string"));
});
