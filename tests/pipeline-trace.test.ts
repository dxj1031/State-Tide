import test from "node:test";
import assert from "node:assert/strict";
import { explainNormalization } from "../lib/pipeline-trace.ts";

const analysis = {
  situation: "joining a hackathon",
  automatic_thought: "I might not be good enough.",
  emotion_labels: ["nervous" as const],
  emotion_intensity: 5,
  behavior: null
};

test("fields the model supplied are marked llm, the rest local", () => {
  const { provenance } = explainNormalization(
    { situation: "joining a hackathon", emotion_labels: ["nervous"] },
    analysis,
    "{}"
  );
  const bySource = Object.fromEntries(provenance.map((p) => [p.field, p.source]));

  assert.equal(bySource.situation, "llm");
  assert.equal(bySource.emotion_labels, "llm");
  // Absent from the raw record, so normalizeAnalysisRecord used local inference.
  assert.equal(bySource.automatic_thought, "local");
  assert.equal(bySource.emotion_intensity, "local");
  assert.equal(bySource.behavior, "local");
});

test("guards report fences, out-of-enum labels, and clamped intensity", () => {
  const { guards } = explainNormalization(
    { emotion_labels: ["nervous", "when", "sluggish"], emotion_intensity: 44 },
    analysis,
    '```json\n{"emotion_intensity":44}\n```'
  );
  const joined = guards.join(" | ");

  assert.match(joined, /fences/i);
  assert.match(joined, /outside the emotion enum/i);
  assert.match(joined, /when/);
  assert.match(joined, /Clamped intensity 44/);
  // "sluggish" is a valid alias, so it must not be reported as dropped.
  assert.equal(/sluggish/.test(joined), false);
});

test("guards report fields discarded for restating the situation", () => {
  const { guards } = explainNormalization(
    { automatic_thought: "joining a hackathon", behavior: "joining a hackathon" },
    { ...analysis, automatic_thought: null, behavior: null },
    "{}"
  );

  assert.equal(guards.filter((g) => /restated the situation/.test(g)).length, 2);
});

test("a clean response produces no guards", () => {
  const { guards } = explainNormalization(
    {
      situation: "joining a hackathon",
      automatic_thought: "I might not be good enough.",
      emotion_labels: ["nervous"],
      emotion_intensity: 5
    },
    analysis,
    '{"situation":"joining a hackathon"}'
  );

  assert.deepEqual(guards, []);
});
