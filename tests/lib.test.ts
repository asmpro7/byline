import { describe, expect, it } from "vitest";
import { parseDoi } from "../lib/doi";
import { matchesName } from "../lib/nameMatch";

const author = (given: string, family: string) => ({
  id: 0, given, family, fullName: `${given} ${family}`, affiliations: [], position: "middle" as const,
});

describe("parseDoi", () => {
  it("accepts raw, prefixed and URL forms", () => {
    for (const s of ["10.1038/171737a0", "doi:10.1038/171737a0", "https://doi.org/10.1038/171737a0", " HTTPS://dx.doi.org/10.1038/171737A0. "]) {
      expect(parseDoi(s)).toBe("10.1038/171737a0");
    }
  });
  it("rejects other text", () => {
    expect(parseDoi("hello")).toBeNull();
    expect(parseDoi("10.12/short")).toBeNull();
  });
});

describe("matchesName", () => {
  const a = author("John Andrew", "Smith");
  it("matches common name forms", () => {
    for (const q of ["John Smith", "Smith, J.", "J. A. Smith", "smith"]) expect(matchesName(a, q)).toBe(true);
  });
  it("ignores diacritics but not different initials", () => {
    expect(matchesName(author("José", "Núñez"), "Jose Nunez")).toBe(true);
    expect(matchesName(a, "Mary Smith")).toBe(false);
  });
});
