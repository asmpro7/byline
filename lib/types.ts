export type Author = {
  id: number;
  given: string;
  family: string;
  fullName: string;
  orcid?: string;
  affiliations: string[];
  position: "first" | "middle" | "last";
  isCorresponding?: boolean;
};

export type Paper = {
  doi: string;
  title: string;
  authors: Author[];
  journal?: string;
  year?: number;
  citedByCount?: number;
  url: string;
  source: "crossref" | "openalex" | "datacite";
};
