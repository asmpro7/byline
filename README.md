# Byline

Paste a DOI, highlight the authors that matter, and save the result as an image.

## Features

- DOI input accepting `10.x/y`, `doi:…` and `doi.org` URLs
- Metadata merged from Crossref and OpenAlex (affiliations, ORCIDs, corresponding authors), with DataCite as a fallback
- Two highlight groups with editable legend labels
- Presets: first author, last author, corresponding author, and "Highlight me" (fuzzy name match, remembered in your browser)
- Highlight styles: marker, bold, underline, box
- Light and dark themes; card and 1200×630 social layouts
- Export PNG or JPEG at 1x to 3x, copy the image, copy the author list as rich text (highlights in bold), copy a share link
- The URL always reproduces the current paper, highlights and look
- Full affiliations (the complete text from the paper, not just institution names)
- Publisher and journal logos, loaded after the card appears
- Impact factor and quartile you type in, shown as chips on the card
- Highlight legend can be switched off
- Long author lists (over 24) collapse to the first 8, the last 4, and anyone highlighted

## Run locally

```bash
npm install
cp .env.example .env.local   # set CONTACT_EMAIL
npm run dev
npm test
```

## Put it on GitHub and Vercel

```bash
git init && git add . && git commit -m "Initial commit"
gh repo create byline --public --source=. --push
```

Then import the repo at https://vercel.com/new (framework preset: Next.js) and add the environment
variable `CONTACT_EMAIL`. Every push to `main` deploys to production and every pull request gets a preview URL.

## Logos, impact factor and quartile

- **Logos:** the publisher logo comes from OpenAlex (Wikimedia Commons), falling back to the site icon. Journals rarely have
  a logo in open data, so the journal logo is the icon of its website. Logos are embedded as data URIs so image export never fails on CORS.
  If none is found, nothing is shown.
- **Impact factor and quartile:** these are licensed by Clarivate and have no free API, so you type them in the "Journal" panel.
  They appear as chips on the card and are included in the share link.

## How it works

- `app/api/paper/route.ts` validates the DOI, calls `lib/sources.ts`, and returns normalized JSON with edge-cache headers.
- `components/PaperCard.tsx` is the element that gets captured, using `html-to-image` in the browser, so no headless browser is needed on Vercel.
- Nothing is stored server-side. Your name and recent DOIs stay in `localStorage`.

## Roadmap

Highlight by affiliation, dynamic Open Graph previews (`next/og`), BibTeX/APA/RIS copy, batch mode for CV publication lists, QR code, SVG export, Playwright end-to-end tests.

## License

MIT
