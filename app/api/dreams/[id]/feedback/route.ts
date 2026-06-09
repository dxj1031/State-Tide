import { NextRequest, NextResponse } from "next/server";
import {
  getDreamRepository,
  makeFeedback,
  mergeFeedbackIntoStyleMemory
} from "@/lib/dream-store";
import type { DreamFeedback } from "@/lib/dream-types";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const VALID_SCOPES = new Set(["none", "future_dreams", "same_cycle_type"]);

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    outputId?: string | null;
    fitScore?: number | null;
    styleFeedback?: string;
    applyScope?: DreamFeedback["applyScope"];
  };
  const repository = await getDreamRepository();
  const record = await repository.getDream(id);

  if (!record) {
    return NextResponse.json({ error: "Dream not found." }, { status: 404 });
  }

  const applyScope =
    body.applyScope && VALID_SCOPES.has(body.applyScope) ? body.applyScope : "none";
  const feedback = makeFeedback({
    seedId: id,
    outputId: body.outputId ?? null,
    fitScore: body.fitScore ?? null,
    styleFeedback: body.styleFeedback ?? "",
    applyScope,
    appliedToMemory: applyScope !== "none"
  });
  const savedFeedback = await repository.addFeedback(feedback);

  if (savedFeedback.appliedToMemory) {
    const memory = await repository.getStyleMemory();
    await repository.saveStyleMemory(mergeFeedbackIntoStyleMemory(memory, savedFeedback));
  }

  return NextResponse.json(savedFeedback);
}
