import { NextRequest, NextResponse } from "next/server";
import {
  buildStateNodeFromCandidate,
  heuristicClassifyState,
  NOVELTY_THRESHOLD,
  parseClassificationResponse,
  stripJsonFences,
  type ClassificationResult
} from "@/lib/state-classification";
import { explainNormalization, type TraceEvent } from "@/lib/pipeline-trace";
import { createRateLimiter } from "@/lib/rate-limit";
import { loadStateNodes, saveStateNodes } from "@/lib/state-node-store";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Haiku is sized to the job: one short note in, a fixed ~250-token JSON record
// out. It also keeps the per-call cost of the public endpoint at its lowest.
const DEFAULT_MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 250;
const TEMPERATURE = 0;

// The endpoint is public and unauthenticated, and every call spends real money.
// max_tokens caps the response; these cap the request, which is the side an
// attacker controls. A state note is one or two sentences by design.
const MAX_INPUT_CHARS = 600;
const rateLimiter = createRateLimiter({ windowMs: 60_000, max: 8 });

const SYSTEM_PROMPT =
  "You are a function that returns ONLY valid JSON. Do NOT output explanations. Do NOT output natural language outside JSON. Do NOT add extra fields. Do NOT wrap the JSON in markdown. Return exactly one JSON object with this schema: {\"situation\":\"string | null\",\"automatic_thought\":\"string | null\",\"emotion_labels\":[\"anxious\"|\"nervous\"|\"overwhelmed\"|\"sad\"|\"drained\"|\"frustrated\"|\"uncertain\"|\"neutral\"],\"emotion_intensity\":0,\"behavior\":\"string | null\"}. Rules: emotion_labels must contain only values from that enum. Before returning each emotion label, check that it is actually emotion vocabulary, not a situation word, action, intensifier, pronoun, or filler. Invalid examples include feel, felt, this, work, really, avoided, hackathon, tonight. If no clear emotion is present, return [\"neutral\"]. situation must be a short phrase, not a full sentence. automatic_thought must be the likely internal belief, not the situation. behavior must describe what the user did, avoided, or implied doing; if unclear use null. emotion_intensity must be an integer 0 to 10 and default to 5 if uncertain. Output valid JSON only.";

/**
 * Streams the classification pipeline as newline-delimited JSON so the client can
 * render each stage as it happens instead of only seeing the final record. The
 * last event carries the ClassificationResult under `result`.
 */
export async function POST(request: NextRequest) {
  // x-real-ip is stamped by Vercel's proxy; the leftmost x-forwarded-for entry
  // is whatever the client claimed, so it is only a local-dev fallback. Reading
  // x-forwarded-for first would let an attacker rotate the header and skip the
  // limiter entirely.
  const clientKey =
    request.headers.get("x-real-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ||
    "unknown";

  if (!rateLimiter.check(clientKey)) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429 }
    );
  }

  const { text } = (await request.json()) as { text?: string };

  if (!text || typeof text !== "string") {
    return NextResponse.json({ error: "Text is required." }, { status: 400 });
  }

  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: `Note is too long. Keep it under ${MAX_INPUT_CHARS} characters.` },
      { status: 413 }
    );
  }

  const started = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: Omit<TraceEvent, "at">) => {
        controller.enqueue(
          encoder.encode(JSON.stringify({ ...event, at: Date.now() - started }) + "\n")
        );
      };

      try {
        await runPipeline(text, emit);
      } catch (error) {
        // The pipeline already falls back internally; reaching here means
        // something outside it broke, and the client still needs a terminator.
        emit({
          stage: "done",
          title: "Pipeline failed",
          ok: false,
          note: error instanceof Error ? error.message : String(error)
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      // Ask intermediaries not to buffer, or the stage-by-stage timing is lost.
      "x-accel-buffering": "no"
    }
  });
}

type Emit = (event: Omit<TraceEvent, "at">) => void;

async function runPipeline(text: string, emit: Emit) {
  emit({
    stage: "input",
    title: "Raw note received",
    fields: [
      { k: "characters", v: String(text.length) },
      { k: "words", v: String(text.trim().split(/\s+/).filter(Boolean).length) }
    ],
    code: text
  });

  const stateNodes = await loadStateNodes();

  emit({
    stage: "state-nodes",
    title: "Loaded known state nodes",
    note: "Read from data/state-nodes.json — the corpus new notes get scored against.",
    fields: [{ k: "nodes", v: String(stateNodes.length) }]
  });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL;

  if (!apiKey) {
    emit({
      stage: "fallback",
      title: "No API key — using the local heuristic",
      ok: false,
      note: "ANTHROPIC_API_KEY is unset, so the semantic layer is skipped entirely.",
      fields: [{ k: "engine", v: "heuristic" }]
    });

    return finish(heuristicClassifyState(text, stateNodes), stateNodes, emit, {
      llmSupplied: false
    });
  }

  emit({
    stage: "contract",
    title: "Built the schema contract",
    note: "The model is constrained to one JSON object; emotion_labels is a closed enum.",
    fields: [
      { k: "model", v: model },
      { k: "max_tokens", v: String(MAX_TOKENS) },
      { k: "temperature", v: String(TEMPERATURE) },
      { k: "system prompt", v: `${SYSTEM_PROMPT.length} chars` }
    ],
    code: SYSTEM_PROMPT
  });

  emit({
    stage: "request",
    title: "POST api.anthropic.com/v1/messages",
    note: "Waiting on the model — this is the only network hop in the pipeline."
  });

  const requestStarted = Date.now();
  let rawText = "";
  let usage: { input_tokens?: number; output_tokens?: number } | undefined;

  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        system: SYSTEM_PROMPT,
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
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const textBlock = payload.content?.find((block) => block.type === "text")?.text;

    if (!textBlock) {
      throw new Error("Anthropic response did not include text content.");
    }

    rawText = textBlock;
    usage = payload.usage;

    emit({
      stage: "response",
      title: "Model returned raw JSON",
      fields: [
        { k: "latency", v: `${Date.now() - requestStarted} ms` },
        { k: "input tokens", v: String(usage?.input_tokens ?? "-") },
        { k: "output tokens", v: String(usage?.output_tokens ?? "-") },
        { k: "bytes", v: String(rawText.length) }
      ],
      code: rawText
    });
  } catch (error) {
    emit({
      stage: "fallback",
      title: "API call failed — using the local heuristic",
      ok: false,
      note:
        "Same structured record, produced by hand-written rules instead. The demo stays end-to-end without the API.",
      fields: [
        { k: "after", v: `${Date.now() - requestStarted} ms` },
        { k: "reason", v: error instanceof Error ? error.message : String(error) },
        { k: "engine", v: "heuristic" }
      ]
    });

    return finish(heuristicClassifyState(text, stateNodes), stateNodes, emit, {
      llmSupplied: false
    });
  }

  let result: ClassificationResult;

  try {
    result = parseClassificationResponse(rawText, stateNodes, text);
  } catch (error) {
    emit({
      stage: "fallback",
      title: "Model output did not parse — using the local heuristic",
      ok: false,
      note: "The response was not valid JSON under the contract.",
      fields: [{ k: "reason", v: error instanceof Error ? error.message : String(error) }]
    });

    return finish(heuristicClassifyState(text, stateNodes), stateNodes, emit, {
      llmSupplied: false
    });
  }

  const rawRecord = readRawRecord(rawText);
  const { provenance, guards } = explainNormalization(
    rawRecord,
    {
      situation: result.record.situation,
      automatic_thought: result.record.automatic_thought,
      emotion_labels: result.record.emotion_labels,
      emotion_intensity: result.record.emotion_intensity,
      behavior: result.record.behavior
    },
    rawText
  );

  emit({
    stage: "normalize",
    title: "Validated and merged field by field",
    note: "The local inference runs on every request; each field takes the model's value only if it survives validation.",
    provenance,
    guards
  });

  return finish(result, stateNodes, emit, { llmSupplied: true });
}

function readRawRecord(rawText: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(stripJsonFences(rawText)) as Record<string, unknown>;

    return parsed.record && typeof parsed.record === "object"
      ? (parsed.record as Record<string, unknown>)
      : parsed;
  } catch {
    return {};
  }
}

async function finish(
  result: ClassificationResult,
  stateNodes: Awaited<ReturnType<typeof loadStateNodes>>,
  emit: Emit,
  meta: { llmSupplied: boolean }
) {
  if (!meta.llmSupplied) {
    emit({
      stage: "normalize",
      title: "Structured locally",
      note: "Rule-based inference filled every field: emotion terms, intensity, situation clause, behavior.",
      provenance: [
        { field: "situation", source: "local", value: String(result.record.situation ?? "null") },
        {
          field: "automatic_thought",
          source: "local",
          value: String(result.record.automatic_thought ?? "null")
        },
        {
          field: "emotion_labels",
          source: "local",
          value: result.record.emotion_labels.join(", ")
        },
        {
          field: "emotion_intensity",
          source: "local",
          value: String(result.record.emotion_intensity)
        },
        { field: "behavior", source: "local", value: String(result.record.behavior ?? "null") }
      ]
    });
  }

  emit({
    stage: "score",
    title: result.isNovel ? "Scored as novel — new state created" : "Matched an existing state",
    note: `Every known state is scored against the note; below ${NOVELTY_THRESHOLD} the note becomes a new state.`,
    fields: [
      { k: "threshold", v: String(NOVELTY_THRESHOLD) },
      { k: "scored against", v: `${stateNodes.length} states` },
      { k: "state key", v: result.stateKey },
      // state_id, not label — several states share a label and only the id
      // identifies which one a score belongs to.
      ...result.matches.slice(0, 4).map((match) => ({
        k: match.state_id,
        v: match.score.toFixed(3)
      }))
    ]
  });

  const persisted = await persistNovelStateIfNeeded(result, stateNodes);

  emit({
    stage: "done",
    title: "Record complete",
    fields: [
      { k: "engine", v: persisted.source },
      { k: "tags", v: persisted.record.tags.join(", ") }
    ],
    result: persisted
  });
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
