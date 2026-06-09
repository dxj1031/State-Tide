import { NextRequest, NextResponse } from "next/server";
import { getDreamRepository, normalizeStyleMemory } from "@/lib/dream-store";

export const runtime = "nodejs";

export async function GET() {
  const repository = await getDreamRepository();
  return NextResponse.json(await repository.getStyleMemory());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const repository = await getDreamRepository();
  const styleMemory = await repository.saveStyleMemory(normalizeStyleMemory(body));

  return NextResponse.json(styleMemory);
}
