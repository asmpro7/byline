import { getJson } from "./sources";
import type { JournalInfo } from "./types";

const mailto = process.env.CONTACT_EMAIL;

async function dataUri(url?: string): Promise<string | undefined> {
  if (!url || !/^https?:\/\//.test(url)) return;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const res = await fetch(url, { signal: ctl.signal, redirect: "follow", next: { revalidate: 604800 } });
    const type = (res.headers.get("content-type") ?? "").split(";")[0];
    if (!res.ok || !type.startsWith("image/")) return;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100 || buf.byteLength > 300_000) return;
    return `data:${type};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return;
  } finally {
    clearTimeout(timer);
  }
}

const host = (u?: string) => {
  try {
    return new URL(u ?? "").hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
};

// Journals rarely publish logos as data, so use the site's icon. Fails soft: no icon means no logo.
async function favicon(domain?: string) {
  if (!domain) return;
  return (
    (await dataUri(`https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=https://${domain}&size=128`)) ??
    (await dataUri(`https://icons.duckduckgo.com/ip3/${domain}.ico`))
  );
}

export async function fetchJournal(sourceId?: string, issn?: string, publisherName?: string): Promise<JournalInfo> {
  const ref =
    sourceId && /^S\d+$/.test(sourceId) ? sourceId : issn && /^\d{4}-?\d{3}[\dXx]$/.test(issn) ? `issn:${issn}` : null;
  const qs = mailto ? `?mailto=${encodeURIComponent(mailto)}` : "";
  const src = ref ? await getJson(`https://api.openalex.org/sources/${ref}${qs}`) : null;

  const pid = String(src?.host_organization ?? "").split("/").pop() ?? "";
  const [pub, journalLogo] = await Promise.all([
    /^P\d+$/.test(pid) ? getJson(`https://api.openalex.org/publishers/${pid}${qs}`) : null,
    favicon(host(src?.homepage_url)),
  ]);
  const publisherLogo =
    (await dataUri(pub?.image_thumbnail_url ?? pub?.image_url)) ?? (await favicon(host(pub?.homepage_url)));

  return {
    name: src?.display_name,
    logo: journalLogo,
    publisher: { name: src?.host_organization_name ?? publisherName, logo: publisherLogo },
  };
}
