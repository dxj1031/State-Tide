import { promises as fs } from "node:fs";
import path from "node:path";
import type { StateNode } from "./state-classification.ts";

const STATE_NODES_PATH = path.join(process.cwd(), "data", "state-nodes.json");

function normalizeStateNode(raw: unknown): StateNode | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.label !== "string" ||
    typeof candidate.summary !== "string" ||
    !Array.isArray(candidate.tags) ||
    !Array.isArray(candidate.emojis)
  ) {
    return null;
  }

  return {
    id: candidate.id,
    label: candidate.label,
    summary: candidate.summary,
    tags: candidate.tags.filter((tag): tag is string => typeof tag === "string"),
    emojis: candidate.emojis.filter((emoji): emoji is string => typeof emoji === "string")
  };
}

export async function loadStateNodes() {
  const content = await fs.readFile(STATE_NODES_PATH, "utf8");
  const parsed = JSON.parse(content) as unknown[];

  return parsed
    .map((node) => normalizeStateNode(node))
    .filter((node): node is StateNode => node !== null);
}

export async function saveStateNodes(nodes: StateNode[]) {
  await fs.writeFile(STATE_NODES_PATH, JSON.stringify(nodes, null, 2), "utf8");
}

