import { NextRequest, NextResponse } from "next/server";
import { parseDoi } from "@/lib/doi";
import { fetchPaper } from "@/lib/sources";

export async function GET(req: NextRequest) {
  const doi = parseDoi(req.nextUrl.searchParams.get("doi") ?? "");
  if (!doi) return NextResponse.json({ error: "That isn't a valid DOI." }, { status: 400 });

  const paper = await fetchPaper(doi);
  if (!paper) {
    return NextResponse.json(
      { error: "No paper found for this DOI. Check it for typos, or copy it from the publisher's page." },
      { status: 404 },
    );
  }
  return NextResponse.json(paper, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
