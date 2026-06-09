import { NextRequest, NextResponse } from "next/server";
import { getDreamRepository } from "@/lib/dream-store";
import { translateDreamWithLlm } from "@/lib/dream-llm";
import type { DreamOutputMode } from "@/lib/dream-types";

export const runtime = "nodejs";

const VALID_MODES = new Set(["text", "image", "music"]);

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    targetMode?: DreamOutputMode;
    sourceOutputId?: string | null;
    variantOfOutputId?: string | null;
  };

  if (!body.targetMode || !VALID_MODES.has(body.targetMode)) {
    return NextResponse.json({ error: "A valid target mode is required." }, { status: 400 });
  }

  const repository = await getDreamRepository();
  const record = await repository.getDream(id);

  if (!record) {
    return NextResponse.json({ error: "Dream not found." }, { status: 404 });
  }

  const styleMemory = await repository.getStyleMemory();
  const settings = await repository.getGenerationSettings();
  const sourceOutput =
    record.outputs.find((output) => output.id === body.sourceOutputId) ??
    record.outputs[0] ??
    null;
  const output = await translateDreamWithLlm({
    seed: record.seed,
    sourceOutput,
    targetMode: body.targetMode,
    styleMemory,
    settings,
    variantOfOutputId: body.variantOfOutputId ?? null
  });
  const saved = await repository.addOutput(output);

  return NextResponse.json(saved);
}
