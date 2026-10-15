import { NextRequest, NextResponse } from "next/server";
import { fetchJournal } from "@/lib/journal";

export const maxDuration = 20;

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const info = await fetchJournal(p.get("source") ?? undefined, p.get("issn") ?? undefined, p.get("publisher") ?? undefined);
  return NextResponse.json(info, {
    headers: { "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=2592000" },
  });
}
