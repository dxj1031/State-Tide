import { NextRequest, NextResponse } from "next/server";
import entries from "@/data/journal-entries.json";
import { getDreamRepository } from "@/lib/dream-store";
import { incubateDreamWithLlm } from "@/lib/dream-llm";
import type { DreamCycleCandidate, DreamOutputMode } from "@/lib/dream-types";
import type { JournalEntry } from "@/lib/matching";

export const runtime = "nodejs";

const VALID_MODES = new Set(["text", "image", "music"]);

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    cycle?: DreamCycleCandidate;
    mode?: DreamOutputMode;
  };

  if (!body.cycle || !Array.isArray(body.cycle.entryIds)) {
    return NextResponse.json({ error: "A dream cycle is required." }, { status: 400 });
  }

  const mode = body.mode && VALID_MODES.has(body.mode) ? body.mode : "text";
  const entryMap = new Map((entries as JournalEntry[]).map((entry) => [entry.id, entry]));
  const sourceEntries = body.cycle.entryIds
    .map((id) => entryMap.get(id))
    .filter((entry): entry is JournalEntry => entry !== undefined);

  if (sourceEntries.length === 0) {
    return NextResponse.json({ error: "The selected cycle has no source fragments." }, { status: 400 });
  }

  const repository = await getDreamRepository();
  const styleMemory = await repository.getStyleMemory();
  const settings = await repository.getGenerationSettings();
  const result = await incubateDreamWithLlm({
    cycle: body.cycle,
    sourceEntries,
    mode,
    styleMemory,
    settings
  });
  const record = await repository.saveDream(result.seed, result.output);

  return NextResponse.json({ ...record, source: result.source });
}
