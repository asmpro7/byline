import type { ReactNode, Ref } from "react";
import type { Paper } from "@/lib/types";

export type CardOpts = {
  theme: "light" | "dark";
  layout: "card" | "social";
  style: "marker" | "bold" | "underline" | "box";
  affiliations: boolean;
  meta: boolean;
  labels: [string, string];
};

const MAX = 24; // above this, long author lists collapse to first 8 + last 4 + any highlighted author

export default function PaperCard({
  paper,
  marks,
  opts,
  innerRef,
}: {
  paper: Paper;
  marks: Record<number, 1 | 2>;
  opts: CardOpts;
  innerRef: Ref<HTMLDivElement>;
}) {
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

  const used = (g: number) => Object.values(marks).includes(g as 1 | 2);
  const meta = [paper.journal, paper.year].filter(Boolean).join(", ");

  return (
    <div ref={innerRef} className={`card ${opts.layout} ${opts.theme} s-${opts.style}`}>
      {opts.meta && meta && <p className="meta">{meta}</p>}
      <h2>{paper.title}</h2>
      <p className="authors">{nodes}</p>
      {n - shown.length > 0 && <p className="meta">{n - shown.length} more authors not shown</p>}
      {opts.affiliations && affs.length > 0 && (
        <ol className="affs">
          {affs.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ol>
      )}
      {(used(1) || used(2)) && (
        <p className="legend">
          {([1, 2] as const).map(
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
      {opts.meta && (
        <p className="doi">
          doi.org/{paper.doi}
          {paper.citedByCount != null && `, cited ${paper.citedByCount.toLocaleString("en-US")} times`}
        </p>
      )}
    </div>
  );
}
