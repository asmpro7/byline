"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toBlob, toJpeg, toPng } from "html-to-image";
import type { JournalInfo, Paper } from "@/lib/types";
import { parseDoi } from "@/lib/doi";
import { matchesName } from "@/lib/nameMatch";
import PaperCard, { type CardOpts } from "./PaperCard";

type G = 1 | 2 | 3;
type Marks = Record<number, G>;
type BoolKey = Exclude<keyof CardOpts, "theme" | "layout" | "style" | "labels">;

class ApiError extends Error {}

const GROUPS = [1, 2, 3] as const;
const STYLES = ["marker", "bold", "underline", "box"];
const DEFAULTS: CardOpts = {
  theme: "light",
  layout: "card",
  style: "marker",
  affiliations: true,
  pubLogo: true,
  jourLogo: true,
  journalName: true,
  doi: true,
  citations: true,
  legend: true,
  labels: ["Highlighted", "Collaborators", "Lab members"],
};
const SHOW: [BoolKey, string][] = [
  ["affiliations", "Full affiliations"],
  ["pubLogo", "Publisher logo"],
  ["jourLogo", "Journal logo"],
  ["journalName", "Journal and year"],
  ["doi", "DOI"],
  ["citations", "Citation count"],
  ["legend", "Highlight legend"],
];

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

// One retry for network errors and server errors, with a timeout so a stalled request can't hang the UI.
async function fetchRetry(url: string, ms = 28000) {
  let last: unknown;
  for (let i = 0; i < 2; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (res.status < 500) return res;
      last = res;
    } catch (e) {
      last = e;
    } finally {
      clearTimeout(timer);
    }
  }
  if (last instanceof Response) return last;
  throw last;
}

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
  const [journal, setJournal] = useState<JournalInfo | null>(null);
  const [status, setStatus] = useState<"idle" | "loading">("idle");
  const [error, setError] = useState("");
  const [marks, setMarks] = useState<Marks>({});
  const [active, setActive] = useState<G>(1);
  const [opts, setOpts] = useState<CardOpts>(DEFAULTS);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(2);
  const [me, setMe] = useState("");
  const [filter, setFilter] = useState("");
  const [ifText, setIfText] = useState("");
  const [qText, setQText] = useState("");
  const [toast, setToast] = useState("");
  const [recent, setRecent] = useState<{ doi: string; title: string }[]>([]);
  const [stageW, setStageW] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);
  const papers = useRef(new Map<string, Paper>());
  const journals = useRef(new Map<string, JournalInfo>());

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2400);
  };

  const load = useCallback(async (raw: string, initial?: Marks) => {
    const doi = parseDoi(raw);
    if (!doi) {
      setError("That doesn't look like a DOI. It should start with 10. (for example 10.1038/s41586-020-2649-2).");
      return;
    }
    const id = ++reqId.current;
    setStatus("loading");
    setError("");
    try {
      let data = papers.current.get(doi);
      if (!data) {
        const res = await fetchRetry(`/api/paper?doi=${encodeURIComponent(doi)}`);
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new ApiError(body.error ?? "Lookup failed. Try again in a moment.");
        data = body as Paper;
        papers.current.set(doi, data);
      }
      if (id !== reqId.current) return; // a newer lookup replaced this one
      setPaper(data);
      setMarks(initial ?? {});
      setFilter("");
      setRecent((r) => {
        const next = [{ doi: data!.doi, title: data!.title }, ...r.filter((x) => x.doi !== data!.doi)].slice(0, 5);
        ls.set("byline.recent", JSON.stringify(next));
        return next;
      });

      // Logos load after the card is already on screen.
      const jp = new URLSearchParams();
      if (data.sourceId) jp.set("source", data.sourceId);
      if (data.issn) jp.set("issn", data.issn);
      if (data.publisher) jp.set("publisher", data.publisher);
      const jkey = jp.toString();
      const cached = journals.current.get(jkey);
      setJournal(cached ?? null);
      if (jkey && !cached) {
        fetchRetry(`/api/journal?${jkey}`)
          .then((r) => r.json())
          .then((j: JournalInfo) => {
            journals.current.set(jkey, j);
            if (id === reqId.current) setJournal(j);
          })
          .catch(() => {});
      }
    } catch (e) {
      if (id === reqId.current) {
        setError(e instanceof ApiError ? e.message : "Couldn't reach the server. Check your connection and try again.");
      }
    } finally {
      if (id === reqId.current) setStatus("idle");
    }
  }, []);

  // Restore saved preferences, history, and any state encoded in the URL.
  useEffect(() => {
    setMe(ls.get("byline.me") ?? "");
    try {
      setRecent(JSON.parse(ls.get("byline.recent") ?? "[]"));
    } catch {
      /* ignore */
    }
    let saved: Partial<CardOpts> = {};
    try {
      saved = JSON.parse(ls.get("byline.opts") ?? "{}");
    } catch {
      /* ignore */
    }
    const base: CardOpts = {
      ...DEFAULTS,
      ...saved,
      labels: Array.isArray(saved.labels) && saved.labels.length === 3 ? (saved.labels as CardOpts["labels"]) : DEFAULTS.labels,
    };
    const p = new URLSearchParams(location.search);
    const th = p.get("theme");
    const ly = p.get("layout");
    const st = p.get("style") ?? "";
    if (th === "dark" || th === "light") base.theme = th;
    if (ly === "social" || ly === "card") base.layout = ly;
    if (STYLES.includes(st)) base.style = st as CardOpts["style"];
    setOpts(base);
    setReady(true);

    const doi = p.get("doi");
    if (doi) {
      setInput(doi);
      setIfText(p.get("if") ?? "");
      setQText(p.get("q") ?? "");
      const m: Marks = {};
      (p.get("hl") ?? "").split(",").forEach((t) => {
        const [i, g] = t.split(".");
        if (g === "1" || g === "2" || g === "3") m[+i] = +g as G;
      });
      load(doi, m);
    }
  }, [load]);

  useEffect(() => {
    if (ready) ls.set("byline.opts", JSON.stringify(opts));
  }, [opts, ready]);

  // Keep the URL shareable: it always reproduces the current paper, highlights and look.
  useEffect(() => {
    if (!paper) return;
    const p = new URLSearchParams({ doi: paper.doi, theme: opts.theme, layout: opts.layout, style: opts.style });
    const hl = Object.entries(marks).map(([i, g]) => `${i}.${g}`).join(",");
    if (hl) p.set("hl", hl);
    if (ifText.trim()) p.set("if", ifText.trim());
    if (qText.trim()) p.set("q", qText.trim());
    history.replaceState(null, "", `?${p}`);
  }, [paper, marks, opts.theme, opts.layout, opts.style, ifText, qText]);

  // "/" jumps to the DOI field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/^(INPUT|TEXTAREA)$/.test(t.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Fit the social preview to the available width, so it is scaled rather than cut off.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setStageW(el.clientWidth));
    ro.observe(el);
    setStageW(el.clientWidth);
    return () => ro.disconnect();
  }, [paper]);

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

  // Impact factor and quartile are licensed data, so they are typed in rather than looked up.
  const q = qText.trim().toUpperCase();
  const metrics = {
    impact: ifText.trim() ? `Impact factor ${ifText.trim()}` : undefined,
    q: q ? (/^[1-4]$/.test(q) ? `Q${q}` : q) : undefined,
  };

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

  const social = opts.layout === "social";
  const fit = social && stageW ? Math.min(1, (stageW - 8) / 1200) : 1;
  const card = <PaperCard paper={paper!} marks={marks} opts={opts} journal={journal} metrics={metrics} innerRef={cardRef} />;

  return (
    <main className="wrap">
      <header className="top">
        <h1 className="brand">Byline</h1>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            load(input);
          }}
        >
          <input
            ref={inputRef}
            type="text"
            aria-label="DOI"
            placeholder="Paste a DOI or doi.org link   ( / )"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoFocus
          />
          <button className="primary" disabled={status === "loading" || !input.trim()}>
            {status === "loading" ? "Looking up…" : "Find paper"}
          </button>
        </form>
      </header>
      {error && (
        <p className="err" role="alert">
          {error}
        </p>
      )}
      {!paper && (
        <div className="empty">
          <p className="lede">Highlight the authors that matter on any paper, then save the result as an image.</p>
          <p className="try">
            Try
            <button type="button" onClick={() => go("10.1038/171737a0")}>Watson and Crick, 1953</button>
            or
            <button type="button" onClick={() => go("10.1038/s41586-020-2649-2")}>NumPy, 2020</button>
            {recent.map((r) => (
              <button type="button" key={r.doi} onClick={() => go(r.doi)} title={r.title}>
                {r.doi}
              </button>
            ))}
          </p>
        </div>
      )}

      {paper && (
        <div className="grid">
          <aside>
            <div className="panel">
              <h3>Highlight</h3>
              {GROUPS.map((g) => (
                <div className="row group" key={g}>
                  <button type="button" className={`pick g${g}`} aria-pressed={active === g} aria-label={`Use ${opts.labels[g - 1]}`} onClick={() => setActive(g)} />
                  <input
                    type="text"
                    aria-label={`Name of color ${g}`}
                    value={opts.labels[g - 1]}
                    onChange={(e) =>
                      setOpts((o) => ({ ...o, labels: o.labels.map((l, i) => (i === g - 1 ? e.target.value : l)) as CardOpts["labels"] }))
                    }
                  />
                </div>
              ))}
              <p className="hint">Pick a color, then click authors in the list to mark them.</p>
              <div className="row">
                <button type="button" onClick={() => preset(authors.slice(0, 1).map((a) => a.id), "")}>First</button>
                <button type="button" onClick={() => preset(authors.length > 1 ? [authors[authors.length - 1].id] : [], "Only one author")}>Last</button>
                <button type="button" onClick={() => preset(authors.filter((a) => a.isCorresponding).map((a) => a.id), "No corresponding author listed")}>Corresponding</button>
                <button type="button" onClick={() => setMarks({})} disabled={!Object.keys(marks).length}>Clear</button>
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
                <button type="button" disabled={!me.trim()} onClick={() => preset(authors.filter((a) => matchesName(a, me)).map((a) => a.id), "No author matches that name")}>
                  Highlight me
                </button>
              </div>
            </div>

            <div className="panel">
              <h3>Card</h3>
              <div className="stack tight">
                <Seg label="Highlight style" value={opts.style} onChange={(style) => setOpts((o) => ({ ...o, style }))}
                  options={[["marker", "Marker"], ["bold", "Bold"], ["underline", "Underline"], ["box", "Box"]]} />
                <Seg label="Theme" value={opts.theme} onChange={(theme) => setOpts((o) => ({ ...o, theme }))}
                  options={[["light", "Light"], ["dark", "Dark"]]} />
                <Seg label="Layout" value={opts.layout} onChange={(layout) => setOpts((o) => ({ ...o, layout }))}
                  options={[["card", "Card"], ["social", "Social 1200×630"]]} />
                <div className="checks">
                  {SHOW.map(([k, text]) => (
                    <label className="check" key={k}>
                      <input type="checkbox" checked={opts[k]} onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))} />
                      {text}
                    </label>
                  ))}
                </div>
                <div className="row two">
                  <input type="text" inputMode="decimal" aria-label="Impact factor" placeholder="Impact factor" value={ifText} onChange={(e) => setIfText(e.target.value)} />
                  <input type="text" aria-label="Quartile" placeholder="Quartile, e.g. Q1" maxLength={6} value={qText} onChange={(e) => setQText(e.target.value)} />
                </div>
                <p className="hint">Impact factor and quartile are licensed data, so type them in. Empty fields stay off the card.</p>
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

          <section className="preview">
            <div className="stage" ref={stageRef}>
              {social ? (
                <div className="frame" style={{ width: 1200 * fit, height: 630 * fit }}>
                  <div style={{ width: 1200, transform: `scale(${fit})`, transformOrigin: "top left" }}>{card}</div>
                </div>
              ) : (
                <div className="frame" style={{ width: "min(720px, 100%)" }}>{card}</div>
              )}
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
              Data from {paper.source} (<a href={paper.url} target="_blank" rel="noreferrer">open paper</a>)
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
