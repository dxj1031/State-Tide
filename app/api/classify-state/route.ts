import { NextRequest, NextResponse } from "next/server";
import {
  buildStateNodeFromCandidate,
  heuristicClassifyState,
  parseClassificationResponse,
  type ClassificationResult
} from "@/lib/state-classification";
import { loadStateNodes, saveStateNodes } from "@/lib/state-node-store";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

export async function POST(request: NextRequest) {
  const { text } = (await request.json()) as { text?: string };

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  const stateNodes = await loadStateNodes();
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    const fallback = heuristicClassifyState(text, stateNodes);
    return NextResponse.json(await persistNovelStateIfNeeded(fallback, stateNodes));
  }

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: 250,
        temperature: 0,
        system:
          "You are a function that returns ONLY valid JSON. Do NOT output explanations. Do NOT output natural language outside JSON. Do NOT add extra fields. Do NOT wrap the JSON in markdown. Return exactly one JSON object with this schema: {\"situation\":\"string | null\",\"automatic_thought\":\"string | null\",\"emotion_labels\":[\"anxious\"|\"nervous\"|\"overwhelmed\"|\"sad\"|\"drained\"|\"frustrated\"|\"uncertain\"|\"neutral\"],\"emotion_intensity\":0,\"behavior\":\"string | null\"}. Rules: emotion_labels must contain only values from that enum. Never include filler words or actions as emotions. If no clear emotion is present, return [\"neutral\"]. situation must be a short phrase, not a full sentence. automatic_thought must be the likely internal belief, not the situation. behavior must describe what the user did, avoided, or implied doing; if unclear use null. emotion_intensity must be an integer 0 to 10 and default to 5 if uncertain. Output valid JSON only.",
        messages: [
          {
            role: "user",
            content: `Analyze the following note and return JSON only.\n\nInput:\n${text}`
          }
        ]
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed with ${response.status}`);
    }

    const payload = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const textBlock = payload.content?.find((block) => block.type === "text")?.text;

    if (!textBlock) {
      throw new Error("Anthropic response did not include text content.");
    }

    const parsed = parseClassificationResponse(textBlock, stateNodes, text);
    const result: ClassificationResult = {
      ...parsed,
      source: "anthropic"
    };

    return NextResponse.json(await persistNovelStateIfNeeded(result, stateNodes));
  } catch {
    const fallback = heuristicClassifyState(text, stateNodes);
    return NextResponse.json(await persistNovelStateIfNeeded(fallback, stateNodes));
  }
}

async function persistNovelStateIfNeeded(result: ClassificationResult, stateNodes: Awaited<ReturnType<typeof loadStateNodes>>) {
  if (!result.isNovel || !result.newState) {
    return result;
  }

  const newNode = buildStateNodeFromCandidate(result.newState, stateNodes);

  if (!stateNodes.some((node) => node.id === newNode.id)) {
    await saveStateNodes([...stateNodes, newNode]);
  }

  return {
    ...result,
    stateKey: newNode.id,
    label: newNode.label,
    emojis: newNode.emojis,
    record: {
      ...result.record,
      id: newNode.id,
      tags: newNode.tags,
      alternative_framing: newNode.summary,
      similar_states: [
        {
          state_id: newNode.id,
          score: 1,
          reason: "New state created because existing states stayed below the novelty threshold."
        },
        ...result.record.similar_states
      ].slice(0, 5),
      is_novel: true
    },
    fragments: newNode.tags.slice(0, 3).map((tag, index) => ({
      key: tag.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      label: tag,
      emoji: newNode.emojis[index] ?? newNode.emojis[0],
      evidence: result.newState?.tags ?? []
    })),
    matches: [
      {
        state_id: newNode.id,
        label: newNode.label,
        score: 1,
        reason: "New state created because existing states stayed below the novelty threshold."
      },
      ...result.matches
    ]
  } satisfies ClassificationResult;
}
