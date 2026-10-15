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
  sourceId?: string; // OpenAlex source id, used to look up journal details
  issn?: string;
  publisher?: string;
};

export type JournalInfo = {
  name?: string;
  logo?: string; // data URI, so image export never hits CORS
  publisher?: { name?: string; logo?: string };
};
