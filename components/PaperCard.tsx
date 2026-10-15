import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import type { JournalInfo, Paper } from "@/lib/types";

export type CardOpts = {
  theme: "light" | "dark";
  layout: "card" | "social";
  style: "marker" | "bold" | "underline" | "box";
  affiliations: boolean;
  pubLogo: boolean;
  jourLogo: boolean;
  journalName: boolean;
  doi: boolean;
  citations: boolean;
  legend: boolean;
  labels: [string, string, string];
};

export type Metrics = { impact?: string; q?: string };

const MAX = 24; // above this, long author lists collapse to first 8 + last 4 + any highlighted author
const SOCIAL_AVAIL = 630 - 112; // social card height minus vertical padding

export default function PaperCard({
  paper,
  marks,
  opts,
  journal,
  metrics,
  innerRef,
}: {
  paper: Paper;
  marks: Record<number, 1 | 2 | 3>;
  opts: CardOpts;
  journal: JournalInfo | null;
  metrics: Metrics;
  innerRef: RefObject<HTMLDivElement | null>;
}) {
  const inRef = useRef<HTMLDivElement>(null);
  const { authors } = paper;
  const n = authors.length;
  const shown = authors.filter((a, i) => n <= MAX || i < 8 || i >= n - 4 || marks[a.id]);

  const affs: string[] = [];
  shown.forEach((a) => a.affiliations.forEach((x) => !affs.includes(x) && affs.push(x)));

  const nodes: ReactNode[] = [];
  let gap = false;
  authors.forEach((a, i) => {
    if (!shown.includes(a)) {
      gap = true;
      return;
    }
    if (gap) {
      nodes.push(<span key={`gap${i}`}>… </span>);
      gap = false;
    }
    const g = marks[a.id];
    nodes.push(
      <span key={a.id}>
        <span className={g ? `hl g${g}` : undefined}>
          {a.fullName}
          {opts.affiliations && a.affiliations.length > 0 && (
            <sup>{a.affiliations.map((x) => affs.indexOf(x) + 1).join(",")}</sup>
          )}
        </span>
        {i < n - 1 && ", "}
      </span>,
    );
  });

  // Social card: shrink text until everything fits. If it still doesn't, drop the affiliation list.
  useLayoutEffect(() => {
    const card = innerRef.current;
    const el = inRef.current;
    if (!card || !el) return;
    card.style.removeProperty("--u");
    card.classList.remove("squeeze");
    if (opts.layout !== "social") return;
    const fits = () => el.offsetHeight <= SOCIAL_AVAIL;
    const search = () => {
      card.style.setProperty("--u", "1");
      if (fits()) return true;
      let lo = 0.45;
      let hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        card.style.setProperty("--u", String(mid));
        if (fits()) lo = mid;
        else hi = mid;
      }
      card.style.setProperty("--u", String(lo));
      return fits();
    };
    if (!search()) {
      card.classList.add("squeeze");
      search();
    }
  }, [innerRef, paper, marks, opts, journal, metrics.impact, metrics.q]);

  const used = (g: number) => Object.values(marks).includes(g as 1 | 2 | 3);
  const meta = [paper.journal, paper.year].filter(Boolean).join(", ");
  const pubLogo = opts.pubLogo ? journal?.publisher?.logo : undefined;
  const jourLogo = opts.jourLogo && journal?.logo !== journal?.publisher?.logo ? journal?.logo : undefined;
  const chips = [metrics.impact, metrics.q].filter(Boolean);
  const bottom = [
    opts.doi && `doi.org/${paper.doi}`,
    opts.citations && paper.citedByCount != null && `${opts.doi ? "cited" : "Cited"} ${paper.citedByCount.toLocaleString("en-US")} times`,
  ].filter(Boolean);

  return (
    <div ref={innerRef} className={`card ${opts.layout} ${opts.theme} s-${opts.style}`}>
      <div className="in" ref={inRef}>
        {(jourLogo || pubLogo) && (
          <div className="logos">
            {jourLogo && <img className="logo jr" src={jourLogo} alt={`${paper.journal ?? "Journal"} logo`} />}
            {pubLogo && <img className="logo pub" src={pubLogo} alt={`${journal?.publisher?.name ?? "Publisher"} logo`} />}
          </div>
        )}
        {((opts.journalName && meta) || chips.length > 0) && (
          <p className="meta">
            {opts.journalName && meta && <span>{meta}</span>}
            {chips.map((c) => (
              <span className="chip" key={c}>
                {c}
              </span>
            ))}
          </p>
        )}
        <h2>{paper.title}</h2>
        <p className="authors">{nodes}</p>
        {n - shown.length > 0 && <p className="meta more">{n - shown.length} more authors not shown</p>}
        {opts.affiliations && affs.length > 0 && (
          <ol className="affs">
            {affs.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ol>
        )}
        {opts.legend && (used(1) || used(2) || used(3)) && (
          <p className="legend">
            {([1, 2, 3] as const).map(
              (g) =>
                used(g) && (
                  <span key={g}>
                    <i className={`sw g${g}`} />
                    {opts.labels[g - 1]}
                  </span>
                ),
            )}
          </p>
        )}
        {bottom.length > 0 && <p className="doi">{bottom.join(", ")}</p>}
      </div>
    </div>
  );
}
