import { NextResponse } from "next/server";
import { getDreamRepository } from "@/lib/dream-store";

export const runtime = "nodejs";

export async function GET() {
  const repository = await getDreamRepository();
  return NextResponse.json(await repository.listDreams());
}
