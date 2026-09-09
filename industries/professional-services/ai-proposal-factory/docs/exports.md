# Proposal exports

AI Proposal Factory exports only complete proposals whose current required section revisions have been approved. The same approved revisions feed both Markdown and PDF output; rendering never edits, transliterates, strips, or substitutes proposal characters.

## Markdown

Markdown export remains UTF-8 (`text/markdown; charset=utf-8`). It contains the approved proposal sections, risk register, supporting-source appendix, and final validation notice.

## PDF rendering

PDF export uses server-side Chromium through `playwright-core`. The approved proposal is rendered as print HTML with:

- a professional cover and approval metadata
- numbered section headings and natural text wrapping
- A4 page breaks, repeated page numbers, and controlled heading/row breaks
- a structured risk-register table
- a dedicated supporting-source appendix
- Unicode text preserved in the browser DOM and embedded/subset by Chromium in the PDF

Proposal Markdown is HTML-escaped before its formatting syntax is rendered. Code spans and fenced blocks reuse that already-escaped text instead of double-escaping `<`, `>`, or `&`. Reviewed Markdown links and image references print literally, including their labels and destinations; the exporter does not fetch remote images or create active links. JavaScript and service workers are disabled and all page resource requests are blocked. Rendering has no external page assets or network dependency.

Long words, identifiers, source excerpts, and fenced code wrap instead of disappearing beyond the page edge. Sections can span pages; the risk table repeats its header and the source appendix starts on a fresh page. Export formatting does not alter the stored approved revision.

Dates, currency, page size, locale, and timezone are explicit so repeated tests do not depend on the host locale. PDF metadata may still contain renderer-specific binary identifiers; tests validate content and layout contracts rather than byte-for-byte equality.

## Runtime requirements

Local PDF export requires Chromium, Google Chrome, or Microsoft Edge. The API checks an explicit executable override first, then an installed Playwright-managed Chromium, then common system-browser paths. Override discovery when necessary:

```powershell
$env:PDF_CHROMIUM_EXECUTABLE_PATH = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
```

The production API image installs and verifies:

- Debian Chromium at `/usr/bin/chromium`
- Fontconfig
- Noto Sans core and extra fonts
- Noto CJK fonts
- Noto color emoji fonts

The image sets `PDF_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`. These packages are required runtime assets, not optional build tooling. They provide broad Latin, accented, mathematical-symbol, CJK, Arabic, Devanagari, punctuation, and emoji fallback coverage. Local machines also need fonts covering their exported scripts; font coverage must not be inferred merely from successful browser launch.

The API verification stage checks actual Fontconfig family matches (not merely successful fallback), launches its installed Chromium, prints a Unicode PDF, parses it, and checks its page count and text. A browser version or font change must pass this image gate before release. The current revision added that gate but could not execute it locally because no Linux Docker engine was available. A system Chromium override is not a promise of compatibility with every browser version; keep the final-image browser/PDF smoke as a release prerequisite.

CI explicitly installs Playwright Chromium and Noto fonts before running tests, using `.data/rendering/browsers` as its browser location. No fonts or browsers are downloaded at export time.

### Bundling and production dependencies

All three tsup configurations explicitly externalize `playwright-core` (including subpaths) and `marked`. The API declares both as production dependencies. Worker and seed builds traverse the shared API adapters even though they never export PDFs, so their explicit exclusions are also necessary. They retain and verify the JavaScript packages but do **not** need browser binaries or fonts.

Keep the complete external packages: rebundling Playwright traverses optional `chromium-bidi` imports and can also break package-relative runtime assets. Installing `chromium-bidi` or externalizing only the two failing BiDi paths is not the fix.

All runtime images copy the production dependency tree produced with `npm ci --omit=dev`. The lockfile additionally places Fastify under `apps/api/node_modules`, so the API image copies that workspace-local directory too. Copying only root `node_modules` silently omits Fastify. `pdf-lib` remains a development-only upload-test fixture dependency; no production image checks or exporter imports should require it.

## Regression coverage

API-level tests generate, edit, reapprove, and export a proposal containing:

- `≤` and `≥`
- accented personal and customer names
- CJK, Arabic, and Devanagari text
- typographic quotes, em dash, bullet, slash, and euro punctuation
- a long approved section that forces multipage output

The tests retain the approval-only guard, verify exact Unicode presence in Markdown, verify the PDF signature, require multipage output, and check every long-content marker, section heading, risk description/mitigation, and source excerpt. Extracted text coordinates must remain within page bounds. Repeated exports of the same approved revision must have identical page counts and per-page text. An edit must block both formats again, and an unapproved PDF is rejected before browser discovery.

The PDF assertions include mathematical symbols, accented names, CJK, Arabic, simple Devanagari, and typographic punctuation. Arabic presentation forms are normalized **only in assertions**, not in the exported content. PDF text extractors do not consistently expose logical reading order or every virama in complex Devanagari conjuncts: complex-script approved text is checked exactly in UTF-8 Markdown, while PDF assertions use practical searchable characters and the browser's font-shaping path. This is not a claim of byte-for-byte logical text extraction for every script or ligature.

Commands from the repository root:

```powershell
npm run test -w @proposal-factory/api -- test\api.test.ts test\pdf-runtime.test.ts
npm run check
npx --no-install tsup --config containers\seed.tsup.config.ts
node scripts\test-pdf-export.mjs
.\scripts\azure\validate-container-sources.ps1
```

The smoke script starts the **built** API on an ephemeral loopback port with isolated local/fixture state, exercises the real HTTP generation/edit/approval/export endpoints, checks the PDF with `pdfjs-dist`, and stops its own process. It retains synthetic evidence under `.data/rendering/built-api-unicode.pdf`, `built-api-unicode.md`, and `built-api-results.json`, and removes its isolated working state. It makes no Azure calls.

## Recovery validation — September 7, 2026

- Targeted rendering: **13 tests passed** (6 API workflow/export tests and 7 bundling/container-runtime contracts).
- Full `npm run check`: **223 tests passed**, plus lint, workspace typechecks, and all application builds. Counts: API 85, web 5, worker 6, AI 107, Azure-data 18, domain 2.
- Built API Unicode smoke: **17 checks passed**, **11 pages**, **139,139 bytes** with local Edge 151.0.4129.107. All 70 approved commitment markers survived and repeated exports had identical page text/layout.
- Separate seed build, seed `--help`, offline Azure-config `--dry-run`, worker local-mode startup, and container source/command contracts passed.
- **47 emitted external runtime imports** resolved locally, matched non-development lockfile entries, and were covered by the final image COPY rules. No Playwright browser internals remained bundled.
- Recovery found interrupted package extraction and absent npm executable links. Existing links were rebuilt offline; incomplete packages were restored from exact lockfile-integrity-checked npm cache archives without deleting dependency trees, changing manifests, or installing BiDi. A subsequently discovered truncated `pdf-lib` test archive was repaired the same way.
- A transient web-test worker startup timeout passed on targeted rerun and the subsequent full check. Existing PDF parser font-hinting/standard-font warnings did not fail the checks.

**Remaining gates:** independent Assurance re-review; Linux production image build and execution of its browser/font checks; deployed Azure Unicode export, Blob persistence, and authenticated end-to-end validation. No Azure provisioning, deployed validation, commits, or destructive Git operations were performed.
