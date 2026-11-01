import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// STATE_NODES_PATH is resolved from process.cwd() when the module loads, so
// pointing cwd at a directory with no data/ makes writeFile fail the same way a
// read-only serverless filesystem does. The route must survive it.
test("saveStateNodes swallows write failures instead of taking the route down", async () => {
  const original = process.cwd();
  const empty = await mkdtemp(path.join(tmpdir(), "state-tides-"));

  try {
    process.chdir(empty);

    const { saveStateNodes } = await import("../lib/state-node-store.ts");

    const nodes = [
        { id: "x", label: "x", summary: "x", tags: ["x"], emojis: ["\u{1F636}"] }
    ];
    assert.equal(await saveStateNodes(nodes), false);
    await mkdir(path.join(empty, "data"));
    assert.equal(await saveStateNodes(nodes), true);
    assert.equal(JSON.parse(await readFile(path.join(empty, "data/state-nodes.json"), "utf8"))[0].id, "x");
  } finally {
    process.chdir(original);
  }
});
