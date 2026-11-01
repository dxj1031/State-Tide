import test from "node:test";
import assert from "node:assert/strict";
import { sceneFor, statusFor, exportRun, completionStatus } from "../lib/run-playback.ts";
import type { TraceEvent } from "../lib/pipeline-trace.ts";

test("playback routes actual client and server stages into their scenes", () => {
  for (const [stage, scene] of [["submit", "input"], ["request", "model"], ["fallback", "model"], ["persistence", "save"], ["retrieval", "search"], ["timeline", "timeline"], ["action", "action"]] as const) {
    assert.equal(sceneFor({ stage, at: 0, title: "Captured" }), scene);
  }
});

test("playback distinguishes rejected input, skipped model, fallback, and failed persistence", () => {
  assert.equal(statusFor({ stage: "validation", at: 0, title: "Bad body", ok: false }), "Rejected");
  assert.equal(statusFor({ stage: "screen", at: 1, title: "Noise", ok: false }), "Model skipped");
  assert.equal(statusFor({ stage: "fallback", at: 2, title: "Unavailable", ok: false }), "Local fallback");
  assert.equal(statusFor({ stage: "persistence", at: 3, title: "Not saved", ok: false, fields: [{ k: "status", v: "not-saved" }] }), "not-saved");
  assert.equal(completionStatus([{ stage: "validation", at: 0, title: "Bad body", ok: false }]), "Run ended · request rejected");
  assert.equal(completionStatus([{ stage: "persistence", at: 3, title: "Not saved", fields: [{ k: "status", v: "not-saved" }] }]), "Complete · state not saved");
  assert.equal(completionStatus([{ stage: "fallback", at: 1, title: "Local" }]), "Complete · local fallback");
});

test("run export preserves actual events and both clocks without adding fictitious steps", () => {
  const events: TraceEvent[] = [{ stage: "request", at: 120, serverAt: 7, origin: "server", title: "Awaiting model" }];
  const output = JSON.parse(exportRun("current-run", "2026-10-31T00:00:00Z", events));
  assert.equal(output.id, "current-run");
  assert.deepEqual(output.events, events);
  assert.equal(output.events.length, 1);
  assert.equal(events[0].stage, "request");
});
