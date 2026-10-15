import type { Author, Paper } from "./types";
import { norm } from "./nameMatch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Raw = { given?: string; family?: string; name?: string; orcid?: string; affiliations?: string[]; corr?: boolean };

const mailto = process.env.CONTACT_EMAIL;

export async function getJson(url: string, tries = 2): Promise<J | null> {
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: { "User-Agent": `byline-app${mailto ? ` (mailto:${mailto})` : ""}` },
        next: { revalidate: 86400 },
      });
      if (res.ok) return await res.json();
      if (res.status < 500 && res.status !== 429) return null; // definitive answer, don't retry
    } catch {
      /* timeout or network error: retry */
    } finally {
      clearTimeout(timer);
    }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 400));
  }
  return null;
}

const len = (x: string[] = []) => x.join("").length;
const fuller = (a?: string[], b?: string[]) => (len(b) > len(a) ? b : a);
const key = (family = "", given = "") => `${norm(family)}|${norm(given)[0] ?? ""}`;
const clean = (s = "") => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

function splitName(full: string): Raw {
  const parts = full.trim().split(/\s+/);
  const family = parts.pop() ?? "";
  return { given: parts.join(" "), family, name: full };
}

function build(raw: Raw[]): Author[] {
  return raw.map((r, i) => {
    const given = r.given ?? "";
    const family = r.family ?? "";
    return {
      id: i,
      given,
      family,
      fullName: r.name && !family ? r.name : `${given} ${family}`.trim(),
      orcid: r.orcid?.replace(/^https?:\/\/orcid\.org\//, ""),
      affiliations: [...new Set((r.affiliations ?? []).filter(Boolean))],
      position: i === 0 ? "first" : i === raw.length - 1 ? "last" : "middle",
      isCorresponding: r.corr || undefined,
    };
  });
}

export async function fetchPaper(doi: string): Promise<Paper | null> {
  const q = mailto ? `?mailto=${encodeURIComponent(mailto)}` : "";
  const [cr, oa] = await Promise.all([
    getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}${q}`),
    getJson(`https://api.openalex.org/works/https://doi.org/${encodeURI(doi)}${q}`),
  ]);
  const m: J = cr?.message;

  const oaRaw: Raw[] = (oa?.authorships ?? []).map((a: J) => ({
    ...splitName(a.author?.display_name ?? ""),
    orcid: a.author?.orcid,
    // Raw strings are the full text as printed on the paper; institution names are only a fallback.
    affiliations: a.raw_affiliation_strings?.length
      ? a.raw_affiliation_strings
      : (a.institutions ?? []).map((i: J) => i.display_name),
    corr: a.is_corresponding,
  }));

  let title = "";
  let raw: Raw[] = [];
  let source: Paper["source"] = "crossref";
  let journal: string | undefined;
  let year: number | undefined;

  if (m?.title?.[0]) {
    title = clean(m.title[0]);
    const crRaw: Raw[] = (m.author ?? []).map((a: J) => ({
      given: a.given,
      family: a.family,
      name: a.name,
      orcid: a.ORCID,
      affiliations: (a.affiliation ?? []).map((x: J) => x.name),
    }));
    // Enrich Crossref authors with OpenAlex affiliations, ORCIDs and corresponding-author flags.
    const used = new Set<number>();
    raw = crRaw.map((a) => {
      const j = oaRaw.findIndex((b, k) => !used.has(k) && key(b.family, b.given) === key(a.family, a.given));
      if (j < 0) return a;
      used.add(j);
      const b = oaRaw[j];
      return { ...a, orcid: a.orcid ?? b.orcid, affiliations: fuller(a.affiliations, b.affiliations), corr: b.corr };
    });
    if (!raw.length) raw = oaRaw;
    journal = clean(m["container-title"]?.[0]) || undefined;
    year = m.issued?.["date-parts"]?.[0]?.[0];
  } else if (oa?.title) {
    title = clean(oa.title);
    raw = oaRaw;
    source = "openalex";
  } else {
    const dc = (await getJson(`https://api.datacite.org/dois/${encodeURIComponent(doi)}`))?.data?.attributes;
    if (!dc?.titles?.[0]?.title) return null;
    title = clean(dc.titles[0].title);
    source = "datacite";
    year = dc.publicationYear;
    journal = dc.publisher?.name ?? dc.publisher;
    raw = (dc.creators ?? []).map((c: J) => ({
      given: c.givenName,
      family: c.familyName,
      name: c.name,
      orcid: c.nameIdentifiers?.find((n: J) => n.nameIdentifierScheme === "ORCID")?.nameIdentifier,
      affiliations: (c.affiliation ?? []).map((x: J) => (typeof x === "string" ? x : x.name)),
    }));
  }

  if (source !== "datacite") {
    journal ??= oa?.primary_location?.source?.display_name;
    year ??= oa?.publication_year;
  }

  return {
    doi,
    title,
    authors: build(raw),
    journal,
    year,
    citedByCount: oa?.cited_by_count ?? m?.["is-referenced-by-count"],
    url: `https://doi.org/${doi}`,
    source,
    sourceId: oa?.primary_location?.source?.id?.split("/").pop(),
    issn: m?.ISSN?.[0] ?? oa?.primary_location?.source?.issn_l ?? undefined,
    publisher: clean(m?.publisher) || undefined,
  };
}
