import type { TraceEvent, TraceStage } from "./pipeline-trace.ts";

export const RUN_SCENES = ["input", "gate", "memory", "model", "record", "score", "save", "return", "search", "timeline", "action"] as const;
export type RunScene = typeof RUN_SCENES[number] | "error";
const scenes: Record<TraceStage, RunScene> = {
  submit: "input", input: "input", validation: "gate", "state-nodes": "memory",
  screen: "model", contract: "model", request: "model", response: "model", fallback: "model",
  normalize: "record", score: "score", persistence: "save", done: "return",
  retrieval: "search", timeline: "timeline", action: "action", error: "error"
};
export function sceneFor(event: TraceEvent): RunScene { return scenes[event.stage]; }
export function statusFor(event: TraceEvent): string {
  if (event.stage === "error") return "Failed";
  if (event.stage === "screen") return "Model skipped";
  if (event.stage === "fallback") return "Local fallback";
  if (event.stage === "persistence") return event.fields?.find(field => field.k === "status")?.v ?? "Unconfirmed";
  if (event.stage === "timeline" && event.fields?.some(field => field.k === "status" && field.v === "skipped")) return "Skipped";
  if (event.ok === false) return event.stage === "validation" ? "Rejected" : "Failed";
  return "Captured";
}
export function exportRun(id: string, startedAt: string, events: TraceEvent[]) {
  return JSON.stringify({ schemaVersion: 1, id, startedAt, clocks: "at: client receipt milliseconds; serverAt: original server execution milliseconds", events }, null, 2);
}
export function completionStatus(events: TraceEvent[]): string {
  if (events.some(event => event.stage === "validation" && event.ok === false)) return "Run ended · request rejected";
  if (events.some(event => event.stage === "error" || event.stage === "done" && event.ok === false)) return "Run ended · analysis unavailable";
  if (events.some(event => event.stage === "persistence" && event.fields?.some(field => field.k === "status" && field.v === "not-saved"))) return "Complete · state not saved";
  if (events.some(event => event.stage === "fallback")) return "Complete · local fallback";
  return "Current run complete";
}
