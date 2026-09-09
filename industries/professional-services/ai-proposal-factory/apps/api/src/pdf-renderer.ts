import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { marked, Renderer } from "marked";
import type { Opportunity, Proposal } from "@proposal-factory/contracts";
import { getExportRevision } from "@proposal-factory/domain";

const browserCandidates = () => {
  if (process.platform === "win32") {
    return [
      process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
      process.env["PROGRAMFILES(X86)"] &&
        join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe"),
      process.env.LOCALAPPDATA &&
        join(process.env.LOCALAPPDATA, "Microsoft", "Edge", "Application", "msedge.exe"),
      process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
      process.env["PROGRAMFILES(X86)"] &&
        join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe")
    ];
  }
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      join(homedir(), "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome")
    ];
  }
  return [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable"
  ];
};

export function resolveChromiumExecutable() {
  const configured = process.env.PDF_CHROMIUM_EXECUTABLE_PATH;
  if (configured) {
    if (existsSync(configured)) return configured;
    throw new Error(`PDF_CHROMIUM_EXECUTABLE_PATH does not exist: ${configured}`);
  }
  const managedExecutable = chromium.executablePath();
  if (existsSync(managedExecutable)) return managedExecutable;
  const executable = browserCandidates().find((candidate): candidate is string => Boolean(candidate && existsSync(candidate)));
  if (executable) return executable;
  throw new Error(
    "PDF export requires Chromium, Google Chrome, or Microsoft Edge. " +
      "Install a supported browser or set PDF_CHROMIUM_EXECUTABLE_PATH."
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderMarkdown(value: string) {
  const renderer = new Renderer();
  // Input is escaped once before parsing; code renderers must not escape it again.
  renderer.code = ({ text }) => `<pre><code>${text}\n</code></pre>`;
  renderer.codespan = ({ text }) => `<code>${text}</code>`;
  // Print reviewed references, not live links or unavailable remote images.
  renderer.link = ({ raw }) => `<span>${raw}</span>`;
  renderer.image = ({ raw }) => `<span>${raw}</span>`;
  return marked.parse(escapeHtml(value), {
    async: false,
    breaks: false,
    gfm: true,
    renderer
  }) as string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatApprovalDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    year: "numeric"
  }).format(new Date(value));
}

function proposalHtml(proposal: Proposal, opportunity: Opportunity) {
  const approvedAt = proposal.approvedAt ?? proposal.updatedAt;
  const sections = proposal.sections
    .map(
      (section, index) => `
        <section class="proposal-section">
          <div class="section-number">${String(index + 1).padStart(2, "0")}</div>
          <div class="section-content">
            <h2>${escapeHtml(section.title)}</h2>
            <div class="approved-content">${renderMarkdown(getExportRevision(section).content)}</div>
          </div>
        </section>`
    )
    .join("");
  const risks = proposal.risks
    .map(
      (risk) => `
        <tr>
          <td><span class="severity severity-${risk.severity.toLowerCase()}">${escapeHtml(risk.severity)}</span></td>
          <td>${escapeHtml(risk.category)}</td>
          <td><strong>${escapeHtml(risk.title)}</strong><br><span>${escapeHtml(risk.description)}</span></td>
          <td>${escapeHtml(risk.mitigation)}</td>
        </tr>`
    )
    .join("");
  const sources = proposal.citations
    .map(
      (citation, index) => `
        <article class="source">
          <div class="source-index">${index + 1}</div>
          <div>
            <h3>${escapeHtml(citation.title)}</h3>
            <div class="source-kind">${escapeHtml(citation.kind)}</div>
            <p>${escapeHtml(citation.excerpt)}</p>
          </div>
        </article>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(proposal.title)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm 20mm; }
    * { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      color: #17233b;
      font-family: "Noto Sans", "Noto Sans CJK SC", "Noto Sans Arabic", "Noto Sans Devanagari",
        "Segoe UI", Arial, sans-serif;
      font-size: 9.5pt;
      line-height: 1.55;
      margin: 0;
      overflow-wrap: anywhere;
    }
    .cover {
      break-after: page;
      display: flex;
      flex-direction: column;
      min-height: 248mm;
      padding: 10mm 6mm 4mm;
      position: relative;
    }
    .brand {
      align-items: center;
      color: #08718c;
      display: flex;
      font-size: 10pt;
      font-weight: 800;
      gap: 10px;
      letter-spacing: .14em;
      text-transform: uppercase;
    }
    .brand-mark { background: #08718c; border-radius: 3px; height: 24px; width: 24px; }
    .cover-rule { background: linear-gradient(90deg, #08718c, #4bb3c7); height: 4px; margin: 24mm 0 16mm; width: 46mm; }
    .cover h1 {
      color: #101b31;
      font-size: 30pt;
      letter-spacing: -.035em;
      line-height: 1.08;
      margin: 0;
      max-width: 160mm;
      overflow-wrap: anywhere;
    }
    .cover-customer { color: #08718c; font-size: 16pt; font-weight: 650; margin-top: 7mm; }
    .cover-subtitle { color: #58667c; font-size: 11pt; margin-top: 3mm; }
    .cover-meta {
      display: grid;
      gap: 4mm;
      grid-template-columns: repeat(3, 1fr);
      margin-top: auto;
    }
    .meta-card { border-left: 2px solid #4bb3c7; padding: 2mm 0 2mm 4mm; }
    .meta-label { color: #68778d; font-size: 7.5pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .meta-value { color: #17233b; font-size: 10pt; font-weight: 650; margin-top: 1mm; overflow-wrap: anywhere; }
    .approval-banner {
      background: #e8f5f7;
      border-radius: 4px;
      color: #07566a;
      font-size: 8.5pt;
      margin-top: 9mm;
      padding: 4mm;
    }
    .proposal-section {
      display: grid;
      gap: 5mm;
      grid-template-columns: 10mm 1fr;
      margin: 0 0 9mm;
    }
    .section-number { color: #58aabc; font-size: 8pt; font-weight: 800; padding-top: 1.5mm; }
    .section-content { min-width: 0; }
    h2 {
      break-after: avoid;
      color: #08718c;
      font-size: 16pt;
      line-height: 1.2;
      margin: 0 0 3mm;
    }
    h3, h4 { break-after: avoid; color: #17233b; margin: 4mm 0 1.5mm; }
    p { margin: 0 0 3mm; orphans: 3; widows: 3; }
    ul, ol { margin: 1.5mm 0 3mm; padding-left: 6mm; }
    li { margin-bottom: 1mm; }
    strong { color: #101b31; }
    code { background: #edf2f5; border-radius: 2px; font-family: "Noto Sans Mono", monospace; padding: 0 .8mm; }
    pre { white-space: pre-wrap; }
    blockquote { border-left: 2px solid #4bb3c7; color: #536278; margin: 3mm 0; padding: 1mm 0 1mm 4mm; }
    .register, .appendix { break-before: page; }
    .page-title { color: #101b31; font-size: 22pt; margin: 0 0 3mm; }
    .page-intro { color: #657389; margin: 0 0 7mm; }
    table { border-collapse: collapse; font-size: 8pt; table-layout: fixed; width: 100%; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    th {
      background: #08718c;
      color: white;
      font-size: 7.5pt;
      letter-spacing: .04em;
      padding: 2.5mm;
      text-align: left;
      text-transform: uppercase;
    }
    td { border-bottom: 1px solid #dce5eb; padding: 3mm 2.5mm; overflow-wrap: anywhere; vertical-align: top; }
    .register th:nth-child(1), .register td:nth-child(1) { width: 16%; }
    .register th:nth-child(2), .register td:nth-child(2) { width: 18%; }
    .register th:nth-child(3), .register td:nth-child(3) { width: 34%; }
    .register th:nth-child(4), .register td:nth-child(4) { width: 32%; }
    .severity { border-radius: 10px; display: inline-block; font-size: 7pt; font-weight: 800; padding: 1mm 2mm; text-transform: uppercase; }
    .severity-high { background: #fde8e7; color: #a12622; }
    .severity-medium { background: #fff3d8; color: #805500; }
    .severity-low { background: #e5f3ea; color: #24633b; }
    .source { display: grid; gap: 4mm; grid-template-columns: 9mm minmax(0, 1fr); margin-bottom: 6mm; }
    .source-index {
      align-items: center;
      background: #e8f5f7;
      border-radius: 50%;
      color: #08718c;
      display: flex;
      font-size: 8pt;
      font-weight: 800;
      height: 7mm;
      justify-content: center;
      width: 7mm;
    }
    .source h3 { color: #17233b; font-size: 11pt; margin: 0; }
    .source-kind { color: #08718c; font-size: 7.5pt; font-weight: 700; margin: 1mm 0; text-transform: uppercase; }
    .source p { color: #536278; }
    .disclaimer {
      background: #f3f6f8;
      border-radius: 4px;
      color: #58667c;
      font-size: 8pt;
      margin-top: 12mm;
      padding: 4mm;
    }
  </style>
</head>
<body>
  <section class="cover">
    <div class="brand"><span class="brand-mark"></span>AI Proposal Factory</div>
    <div class="cover-rule"></div>
    <h1>${escapeHtml(proposal.title)}</h1>
    <div class="cover-customer">${escapeHtml(opportunity.customerName)}</div>
    <div class="cover-subtitle">${escapeHtml(opportunity.name)} · ${escapeHtml(opportunity.industry)}</div>
    <div class="cover-meta">
      <div class="meta-card"><div class="meta-label">Duration</div><div class="meta-value">${opportunity.expectedDurationWeeks} weeks</div></div>
      <div class="meta-card"><div class="meta-label">Estimated value</div><div class="meta-value">${escapeHtml(formatCurrency(opportunity.estimatedValue))}</div></div>
      <div class="meta-card"><div class="meta-label">Approved</div><div class="meta-value">${escapeHtml(formatApprovalDate(approvedAt))}</div></div>
    </div>
    <div class="approval-banner">Approved proposal · Content reflects the revisions reviewed in AI Proposal Factory.</div>
  </section>
  <main>${sections}</main>
  <section class="register">
    <h1 class="page-title">Risk Register</h1>
    <p class="page-intro">Delivery findings and mitigations recorded during proposal review.</p>
    <table>
      <thead><tr><th>Severity</th><th>Category</th><th>Finding</th><th>Mitigation</th></tr></thead>
      <tbody>${risks}</tbody>
    </table>
  </section>
  <section class="appendix">
    <h1 class="page-title">Supporting Sources</h1>
    <p class="page-intro">Reusable organizational content used to ground the approved proposal.</p>
    ${sources}
    <div class="disclaimer">Prepared by AI Proposal Factory. All scope, effort, commercial, and risk statements require final customer validation.</div>
  </section>
</body>
</html>`;
}

export async function renderProposalPdf(proposal: Proposal, opportunity: Opportunity) {
  const browser = await chromium.launch({
    executablePath: resolveChromiumExecutable(),
    headless: true,
    args: [
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
      "--disable-sync",
      "--font-render-hinting=none",
      "--no-sandbox"
    ]
  });
  try {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      locale: "en-US",
      serviceWorkers: "block",
      timezoneId: "UTC"
    });
    const page = await context.newPage();
    await page.route("**/*", (route) => route.abort());
    await page.setContent(proposalHtml(proposal, opportunity), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      displayHeaderFooter: true,
      footerTemplate:
        '<div style="color:#738095;font-family:Arial,sans-serif;font-size:8px;padding:0 16mm;text-align:right;width:100%">' +
        'AI Proposal Factory&nbsp;&nbsp;·&nbsp;&nbsp;<span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      format: "A4",
      headerTemplate: "<div></div>",
      margin: { bottom: "20mm", left: "16mm", right: "16mm", top: "18mm" },
      preferCSSPageSize: true,
      printBackground: true
    });
  } finally {
    await browser.close();
  }
}
