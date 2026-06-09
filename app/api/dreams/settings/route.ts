import { NextRequest, NextResponse } from "next/server";
import { getDreamRepository, normalizeSettings } from "@/lib/dream-store";

export const runtime = "nodejs";

export async function GET() {
  const repository = await getDreamRepository();
  return NextResponse.json(await repository.getGenerationSettings());
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Record<string, unknown>;
  const repository = await getDreamRepository();
  const settings = await repository.saveGenerationSettings(normalizeSettings(body));

  return NextResponse.json(settings);
}
