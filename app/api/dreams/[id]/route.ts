import { NextRequest, NextResponse } from "next/server";
import { getDreamRepository } from "@/lib/dream-store";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const repository = await getDreamRepository();
  const record = await repository.getDream(id);

  if (!record) {
    return NextResponse.json({ error: "Dream not found." }, { status: 404 });
  }

  return NextResponse.json(record);
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const repository = await getDreamRepository();
  await repository.deleteDream(id);

  return NextResponse.json({ ok: true });
}
