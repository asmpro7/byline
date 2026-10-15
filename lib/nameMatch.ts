import type { Author } from "./types";

export const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Matches "Jane Smith", "Smith, J." and "J. A. Smith" against an author: same family name, same first initial. */
export function matchesName(author: Author, query: string): boolean {
  const q = query.trim();
  if (!q) return false;
  let given = "";
  let family = "";
  if (q.includes(",")) {
    [family, given = ""] = q.split(",").map((x) => x.trim());
  } else {
    const parts = q.split(/\s+/);
    family = parts.pop() ?? "";
    given = parts.join(" ");
  }
  const f = norm(family);
  if (!f || f !== norm(author.family)) return false;
  const g = norm(given);
  if (!g) return true;
  return g[0] === (norm(author.given)[0] ?? "");
}
