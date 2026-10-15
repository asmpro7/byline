import { NextRequest, NextResponse } from "next/server";
import { parseDoi } from "@/lib/doi";
import { fetchPaper } from "@/lib/sources";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const doi = parseDoi(req.nextUrl.searchParams.get("doi") ?? "");
  if (!doi) return NextResponse.json({ error: "That isn't a valid DOI." }, { status: 400 });

  let paper = null;
  try {
    paper = await fetchPaper(doi);
  } catch {
    return NextResponse.json({ error: "The data services are not responding. Try again in a moment." }, { status: 502 });
  }
  if (!paper) {
    return NextResponse.json(
      { error: "No paper found for this DOI, or the data services did not respond. Check the DOI for typos and try again." },
      { status: 404 },
    );
  }
  return NextResponse.json(paper, {
    headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
  });
}
