/** Accepts "10.x/y", "doi:10.x/y" and doi.org / dx.doi.org URLs. Returns a lowercase DOI or null. */
export function parseDoi(input: string): string | null {
  let s = input
    .trim()
    .replace(/^doi:\s*/i, "")
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/[.,;]+$/, "");
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep as is */
  }
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s.toLowerCase() : null;
}
