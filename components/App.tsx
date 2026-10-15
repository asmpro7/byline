"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toBlob, toJpeg, toPng } from "html-to-image";
import type { Paper } from "@/lib/types";
import { parseDoi } from "@/lib/doi";
import { matchesName } from "@/lib/nameMatch";
import PaperCard, { type CardOpts } from "./PaperCard";

type Marks = Record<number, 1 | 2>;

const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* storage unavailable */
    }
  },
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const STYLES = ["marker", "bold", "underline", "box"];

function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="row seg" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button type="button" key={String(v)} aria-pressed={v === value} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [input, setInput] = useState("");
  const [paper, setPaper] = useState<Paper | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState("");
  const [marks, setMarks] = useState<Marks>({});
  const [active, setActive] = useState<1 | 2>(1);
  const [opts, setOpts] = useState<CardOpts>({
    theme: "light",
    layout: "card",
    style: "marker",
    affiliations: true,
    meta: true,
    labels: ["Highlighted", "Collaborators"],
  });
  const [scale, setScale] = useState(2);
  const [me, setMe] = useState("");
  const [filter, setFilter] = useState("");
  const [toast, setToast] = useState("");
  const [recent, setRecent] = useState<{ doi: string; title: string }[]>([]);
  const cardRef = useRef<HTMLDivElement>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  const load = useCallback(async (raw: string, initial?: Marks) => {
    const doi = parseDoi(raw);
    if (!doi) {
      setError("That doesn't look like a DOI. It should start with 10. (for example 10.1038/s41586-020-2649-2).");
      return;
    }
    setStatus("loading");
    setError("");
    try {
      const res = await fetch(`/api/paper?doi=${encodeURIComponent(doi)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Lookup failed. Try again in a moment.");
      setPaper(data);
      setMarks(initial ?? {});
      setFilter("");
      setRecent((r) => {
        const next = [{ doi: data.doi, title: data.title }, ...r.filter((x) => x.doi !== data.doi)].slice(0, 5);
        ls.set("byline.recent", JSON.stringify(next));
        return next;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatus("idle");
    }
  }, []);

  // Restore saved name, history, and any state encoded in the URL.
  useEffect(() => {
    setMe(ls.get("byline.me") ?? "");
    try {
      setRecent(JSON.parse(ls.get("byline.recent") ?? "[]"));
    } catch {
      /* ignore */
    }
    const p = new URLSearchParams(location.search);
    const style = p.get("style") ?? "";
    setOpts((o) => ({
      ...o,
      theme: p.get("theme") === "dark" ? "dark" : "light",
      layout: p.get("layout") === "social" ? "social" : "card",
      style: (STYLES.includes(style) ? style : "marker") as CardOpts["style"],
    }));
    const doi = p.get("doi");
    if (doi) {
      setInput(doi);
      const m: Marks = {};
      (p.get("hl") ?? "").split(",").forEach((t) => {
        const [id, g] = t.split(".");
        if (g === "1" || g === "2") m[+id] = +g as 1 | 2;
      });
      load(doi, m);
    }
  }, [load]);

  // Keep the URL shareable: it always reproduces the current paper, highlights and look.
  useEffect(() => {
    if (!paper) return;
    const p = new URLSearchParams({ doi: paper.doi, theme: opts.theme, layout: opts.layout, style: opts.style });
    const hl = Object.entries(marks).map(([i, g]) => `${i}.${g}`).join(",");
    if (hl) p.set("hl", hl);
    history.replaceState(null, "", `?${p}`);
  }, [paper, marks, opts.theme, opts.layout, opts.style]);

  const toggle = (id: number) =>
    setMarks((m) => {
      const n = { ...m };
      if (n[id] === active) delete n[id];
      else n[id] = active;
      return n;
    });

  const preset = (ids: number[], none: string) => {
    if (!ids.length) return flash(none);
    setMarks((m) => {
      const n = { ...m };
      ids.forEach((i) => (n[i] = active));
      return n;
    });
  };

  const authors = paper?.authors ?? [];
  const listed = useMemo(() => {
    const f = filter.toLowerCase();
    return authors.filter((a) => `${a.fullName} ${a.affiliations.join(" ")}`.toLowerCase().includes(f));
  }, [authors, filter]);

  async function capture(kind: "png" | "jpeg" | "blob"): Promise<string | Blob> {
    const node = cardRef.current;
    if (!node) throw new Error("Nothing to capture");
    const o = { pixelRatio: scale, cacheBust: true };
    await toPng(node, o); // warm-up pass: Safari drops content on the first render
    if (kind === "png") return toPng(node, o);
    if (kind === "jpeg") return toJpeg(node, { ...o, quality: 0.95, backgroundColor: "#fff" });
    const blob = await toBlob(node, o);
    if (!blob) throw new Error("Capture failed");
    return blob;
  }

  async function download(kind: "png" | "jpeg") {
    try {
      const url = (await capture(kind)) as string;
      const a = document.createElement("a");
      a.href = url;
      a.download = `${paper!.doi.replace(/[^a-z0-9]+/gi, "-")}.${kind === "jpeg" ? "jpg" : "png"}`;
      a.click();
    } catch {
      flash("Export failed. Try again.");
    }
  }

  async function copyImage() {
    try {
      const blob = (await capture("blob")) as Blob;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("Image copied");
    } catch {
      flash("Your browser blocked image copy. Use Download instead.");
    }
  }

  async function copyAuthors() {
    const html = authors.map((a) => (marks[a.id] ? `<b>${esc(a.fullName)}</b>` : esc(a.fullName))).join(", ");
    const plain = authors.map((a) => a.fullName).join(", ");
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
      flash("Author list copied with bold highlights");
    } catch {
      flash("Copy failed.");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      flash("Link copied");
    } catch {
      flash("Copy failed.");
    }
  }

  const go = (doi: string) => {
    setInput(doi);
    load(doi);
  };

  return (
    <main className="wrap">
      <h1 className="brand">Byline</h1>
      <p className="lede">Paste a DOI, highlight the authors that matter, and save the result as an image.</p>

      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault();
          load(input);
        }}
      >
        <input
          type="text"
          aria-label="DOI"
          placeholder="10.1038/s41586-020-2649-2 or https://doi.org/…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          autoFocus
        />
        <button className="primary" disabled={status === "loading" || !input.trim()}>
          {status === "loading" ? "Looking up…" : "Find paper"}
        </button>
      </form>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {!paper && (
        <p className="try">
          Try
          <button type="button" onClick={() => go("10.1038/171737a0")}>
            Watson and Crick, 1953
          </button>
          or
          <button type="button" onClick={() => go("10.1038/s41586-020-2649-2")}>
            NumPy, 2020
          </button>
          {recent.map((r) => (
            <button type="button" key={r.doi} onClick={() => go(r.doi)} title={r.title}>
              {r.doi}
            </button>
          ))}
        </p>
      )}

      {paper && (
        <div className="grid">
          <aside className="stack">
            <div className="panel">
              <h3>Highlight</h3>
              {([1, 2] as const).map((g) => (
                <div className="row group" key={g}>
                  <button
                    type="button"
                    className={`pick g${g}`}
                    aria-pressed={active === g}
                    aria-label={`Use group ${g}`}
                    onClick={() => setActive(g)}
                  />
                  <input
                    type="text"
                    aria-label={`Label for group ${g}`}
                    value={opts.labels[g - 1]}
                    onChange={(e) =>
                      setOpts((o) => ({
                        ...o,
                        labels: g === 1 ? [e.target.value, o.labels[1]] : [o.labels[0], e.target.value],
                      }))
                    }
                  />
                </div>
              ))}
              <p className="hint">Click authors below to mark them with the selected group.</p>
              <div className="row">
                <button type="button" onClick={() => preset(authors.slice(0, 1).map((a) => a.id), "")}>First author</button>
                <button type="button" onClick={() => preset(authors.length > 1 ? [authors[authors.length - 1].id] : [], "Only one author")}>
                  Last author
                </button>
                <button type="button" onClick={() => preset(authors.filter((a) => a.isCorresponding).map((a) => a.id), "No corresponding author listed")}>
                  Corresponding
                </button>
                <button type="button" onClick={() => setMarks({})} disabled={!Object.keys(marks).length}>
                  Clear
                </button>
              </div>
              <div className="row me">
                <input
                  type="text"
                  aria-label="Your name"
                  placeholder="Your name, e.g. Jane Smith"
                  value={me}
                  onChange={(e) => {
                    setMe(e.target.value);
                    ls.set("byline.me", e.target.value);
                  }}
                />
                <button
                  type="button"
                  disabled={!me.trim()}
                  onClick={() => preset(authors.filter((a) => matchesName(a, me)).map((a) => a.id), "No author matches that name")}
                >
                  Highlight me
                </button>
              </div>
            </div>

            <div className="panel">
              <h3>Look</h3>
              <div className="stack tight">
                <Seg label="Highlight style" value={opts.style} onChange={(style) => setOpts((o) => ({ ...o, style }))}
                  options={[["marker", "Marker"], ["bold", "Bold"], ["underline", "Underline"], ["box", "Box"]]} />
                <Seg label="Theme" value={opts.theme} onChange={(theme) => setOpts((o) => ({ ...o, theme }))}
                  options={[["light", "Light"], ["dark", "Dark"]]} />
                <Seg label="Layout" value={opts.layout} onChange={(layout) => setOpts((o) => ({ ...o, layout }))}
                  options={[["card", "Card"], ["social", "Social 1200×630"]]} />
                <label className="check">
                  <input type="checkbox" checked={opts.affiliations} onChange={(e) => setOpts((o) => ({ ...o, affiliations: e.target.checked }))} />
                  Show affiliations
                </label>
                <label className="check">
                  <input type="checkbox" checked={opts.meta} onChange={(e) => setOpts((o) => ({ ...o, meta: e.target.checked }))} />
                  Show journal, year and DOI
                </label>
              </div>
            </div>

            <div className="panel">
              <h3>Authors ({authors.length})</h3>
              <input type="text" aria-label="Filter authors" placeholder="Filter by name or institution" value={filter} onChange={(e) => setFilter(e.target.value)} />
              <div className="list">
                {listed.slice(0, 300).map((a) => (
                  <button type="button" key={a.id} className="who" data-g={marks[a.id]} aria-pressed={!!marks[a.id]} onClick={() => toggle(a.id)}>
                    <span>{a.fullName}</span>
                    <small>{a.affiliations[0]}</small>
                  </button>
                ))}
                {listed.length === 0 && <p className="hint">No author matches that filter.</p>}
                {listed.length > 300 && <p className="hint">Showing 300 of {listed.length}. Filter to narrow the list.</p>}
              </div>
            </div>
          </aside>

          <section>
            <div className="stage">
              <PaperCard paper={paper} marks={marks} opts={opts} innerRef={cardRef} />
            </div>
            <div className="bar">
              <button className="primary" onClick={() => download("png")}>Download PNG</button>
              <button onClick={() => download("jpeg")}>Download JPEG</button>
              <button onClick={copyImage}>Copy image</button>
              <button onClick={copyAuthors}>Copy author list</button>
              <button onClick={copyLink}>Copy share link</button>
              <Seg label="Image scale" value={scale} onChange={setScale} options={[[1, "1x"], [2, "2x"], [3, "3x"]]} />
            </div>
            <p className="src">
              Data from {paper.source}
              {" "}
              (<a href={paper.url} target="_blank" rel="noreferrer">open paper</a>).
            </p>
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </main>
  );
}
