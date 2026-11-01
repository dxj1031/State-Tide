import assert from "node:assert/strict";
import test from "node:test";

// Run against a dedicated local server with ANTHROPIC_API_KEY unset/empty.
// This is separate from the unit suite because it requires a running build.
const baseUrl = process.env.STATE_TIDES_TEST_URL;

test("classification HTTP input validation and noise path", async (t) => {
  assert.ok(baseUrl, "Set STATE_TIDES_TEST_URL to the dedicated local server URL.");

  const cases = [
    { name: "malformed JSON", body: "{", status: 400, error: "Invalid JSON body." },
    { name: "empty body", body: "", status: 400, error: "Invalid JSON body." },
    { name: "null body", body: "null", status: 400, error: "Text is required." },
    { name: "string body", body: '"note"', status: 400, error: "Text is required." },
    { name: "missing text", body: "{}", status: 400, error: "Text is required." },
    { name: "non-string text", body: '{"text":42}', status: 400, error: "Text is required." },
    {
      name: "long text",
      body: JSON.stringify({ text: "x".repeat(601) }),
      status: 413,
      error: "Note is too long. Keep it under 600 characters."
    }
  ];

  for (const entry of cases) {
    await t.test(entry.name, async () => {
      const response = await fetch(new URL("/api/classify-state", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: entry.body,
        signal: AbortSignal.timeout(10_000)
      });

      assert.equal(response.status, entry.status);
      assert.match(response.headers.get("content-type") ?? "", /application\/json/);
      assert.deepEqual(await response.json(), { error: entry.error });
    });
  }

  await t.test("valid noise still returns a completed stream", async () => {
    const response = await fetch(new URL("/api/classify-state", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "asdf" }),
      signal: AbortSignal.timeout(10_000)
    });

    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/x-ndjson/);
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    assert.equal(events.at(-1)?.stage, "done");
    assert.equal(events.at(-1)?.result?.source, "heuristic");
    assert.equal(events.at(-1)?.result?.isNovel, false);
    assert.ok(events.some(event => event.stage === "validation"));
    assert.equal(events.find(event => event.stage === "score")?.title, "No state match — new-state creation skipped");
    assert.equal(events.find(event => event.stage === "persistence")?.fields.find(field => field.k === "status")?.v, "skipped");
  });
});
