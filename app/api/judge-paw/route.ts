import { NextRequest, NextResponse } from "next/server";
import {
  buildJudgePrompt,
  fallbackJudgePawVerdict,
  parseVerdictPayload,
  type PawMessage
} from "@/lib/judge-paw";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-sonnet-4-20250514";

function stripJsonFences(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

export async function POST(request: NextRequest) {
  const { messages } = (await request.json()) as { messages?: PawMessage[] };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Messages are required." }, { status: 400 });
  }

  const sanitizedMessages = messages
    .filter((message) => message && (message.speaker === "blake" || message.speaker === "ryan"))
    .map((message) => ({
      id: String(message.id),
      speaker: message.speaker,
      text: String(message.text).slice(0, 900)
    }))
    .filter((message) => message.text.trim().length > 0)
    .slice(-16);
  const fallback = fallbackJudgePawVerdict(sanitizedMessages);
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ ...fallback, source: "fallback" });
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
        max_tokens: 900,
        temperature: 0.35,
        system:
          "Return only valid JSON. Do not include markdown. Do not invent private facts about real people. Treat celebrity names as fictional demo placeholders.",
        messages: [
          {
            role: "user",
            content: buildJudgePrompt(sanitizedMessages)
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
    const text = payload.content?.find((block) => block.type === "text")?.text;

    if (!text) {
      throw new Error("Anthropic response did not include text content.");
    }

    return NextResponse.json({
      ...parseVerdictPayload(JSON.parse(stripJsonFences(text)), fallback),
      source: "anthropic"
    });
  } catch {
    return NextResponse.json({ ...fallback, source: "fallback" });
  }
}
