import assert from "node:assert/strict";
import test from "node:test";

// The server must use tests/fixtures/model-response.cjs. No live model required.
test("model failures degrade to a completed local result", async (t) => {
  assert.equal(process.env.STATE_TIDES_TEST_MODEL, "1", "Use the documented synthetic model fixture.");
  const baseUrl = process.env.STATE_TIDES_TEST_URL;
  assert.ok(baseUrl, "Set STATE_TIDES_TEST_URL to the dedicated fixture server.");
  assert.ok(["127.0.0.1", "localhost"].includes(new URL(baseUrl).hostname));

  for (const mode of ["array", "primitive", "rate-limit", "quota", "invalid-json", "valid", "hang", "body-hang"]) {
    await t.test(mode, async () => {
      const started = Date.now();
      const response = await fetch(new URL("/api/classify-state", baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: `The hackathon left me bright and brittle. [TEST:${mode}]` }),
        signal: AbortSignal.timeout(15_000)
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /application\/x-ndjson/);
      const raw = await response.text();
      const events = raw.trim().split("\n").map(JSON.parse);
      assert.equal(events.at(-1).stage, "done");
      assert.equal(events.at(-1).result.source, mode === "valid" ? "anthropic" : "heuristic");
      assert.equal(events.some((event) => event.stage === "fallback"), mode !== "valid");
      if (mode.includes("hang")) {
        assert.match(raw, /timed out after 10000 ms/);
        assert.ok(Date.now() - started < 15_000);
      }
    });
  }
});
