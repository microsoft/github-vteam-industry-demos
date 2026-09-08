import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import console from "node:console";
import { once } from "node:events";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const root = resolve(".data", "rendering");
const working = join(root, `smoke-${process.pid}`);
await mkdir(working, { recursive: true });
const child = spawn(process.execPath, [resolve("apps", "api", "dist", "server.js")], {
  env: {
    ...process.env, NODE_ENV: "test", AUTH_MODE: "development",
    AUTH_DEVELOPMENT_ORIGINS: "http://127.0.0.1:5173", HOST: "127.0.0.1", PORT: "0",
    AI_PROVIDER: "fixture", DATA_PROVIDER: "local", LOCAL_DATA_FILE: join(working, "state.json"),
    LOCAL_UPLOAD_DIRECTORY: join(working, "uploads"), TEMP: working, TMP: working, TMPDIR: working
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let logs = "";
child.stdout.on("data", (data) => { logs += data; });
child.stderr.on("data", (data) => { logs += data; });
let base;
const checks = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); }
try {
  const started = Date.now();
  while (!base && Date.now() - started < 90_000) {
    base = logs.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (child.exitCode !== null) throw new Error(`Built API exited: ${logs}`);
    if (!base) await delay(100);
  }
  assert.ok(base, `Built API did not start: ${logs}`);
  async function request(path, method = "GET", payload, expected = 200) {
    const response = await globalThis.fetch(`${base}${path}`, {
      method,
      ...(payload === undefined ? {} : {
        headers: { "content-type": "application/json" }, body: JSON.stringify(payload)
      })
    });
    assert.equal(response.status, expected, `${method} ${path}: ${await (response.status === expected ? Promise.resolve("") : response.text())}`);
    return response;
  }
  check("Built API healthy in explicit local/fixture mode", (await (await request("/health")).json()).aiProvider === "fixture");
  const run = await (await request("/api/opportunities/opp-01/proposals/generate", "POST", undefined, 202)).json();
  for (let step = 0; step < 4; step += 1) await request(`/api/generation-runs/${run.id}`);
  const proposal = await (await request("/api/opportunities/opp-01/proposal")).json();
  await request(`/api/proposals/${proposal.id}/export?format=pdf`, "GET", undefined, 409);
  check("Unapproved PDF blocked", true);
  const unicode = "Recovery target ≤ 4 hours; measurable improvement ≥ 20%. Élodie Müller, José Álvarez, 山田 太郎, فاطمة الزهراء, अनन्या शर्मा, मीरा देवी. “Approved” — €875,000 • A/B.";
  const content = `${unicode}\n\n` +
    Array.from({ length: 70 }, (_, index) =>
      `Commitment-${String(index + 1).padStart(3, "0")}: ${unicode} Every approved commitment must remain complete across wrapped lines and page boundaries.`
    ).join("\n\n") + "\n\nFINAL-APPROVED-COMMITMENT";
  const edited = await (await request(`/api/proposals/${proposal.id}/sections/scope`, "PATCH", { content })).json();
  for (const section of edited.sections) {
    await request(`/api/proposals/${proposal.id}/sections/${section.key}/approve`, "POST",
      { expectedRevisionId: section.currentRevisionId });
  }
  const reviewed = await (await request(`/api/proposals/${proposal.id}`)).json();
  await request(`/api/proposals/${proposal.id}/approve`, "POST", { expectedReviewVersion: reviewed.reviewVersion });
  const markdown = await (await request(`/api/proposals/${proposal.id}/export?format=markdown`)).text();
  check("Exact approved UTF-8 content in Markdown", markdown.includes(content));
  async function exportPdf() {
    const response = await request(`/api/proposals/${proposal.id}/export?format=pdf`);
    assert.match(response.headers.get("content-type"), /application\/pdf/);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    const task = getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: false });
    const document = await task.promise;
    try {
      const pages = [];
      for (let index = 1; index <= document.numPages; index += 1) {
        const page = await document.getPage(index);
        const text = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        for (const item of text.items) {
          if (!("str" in item) || !item.str.trim()) continue;
          assert.ok(item.transform[4] >= 0 && item.transform[4] + item.width <= viewport.width + 1,
            `Horizontal overflow on page ${index}`);
          assert.ok(item.transform[5] >= 0 && item.transform[5] <= viewport.height, `Vertical overflow on page ${index}`);
        }
        pages.push(text.items.filter((item) => "str" in item).map((item) => item.str).join(" ").replace(/\s+/g, " "));
      }
      return { bytes, pages, pageCount: document.numPages, text: pages.join(" ") };
    } finally { await task.destroy(); }
  }
  const first = await exportPdf();
  check("Valid multipage PDF", first.pageCount >= 6);
  for (const expected of ["≤ 4 hours", "≥ 20%", "Élodie Müller", "José Álvarez", "山田 太郎", "“Approved” — €875,000 • A/B.", "Risk Register", "Supporting Sources", "FINAL-APPROVED-COMMITMENT"]) {
    check(`PDF text: ${expected}`, first.text.includes(expected));
  }
  for (const character of new Set("فاطمةالزهراءमीरादेवी")) assert.ok(first.text.normalize("NFKC").includes(character), `Missing script character ${character}`);
  check("Arabic and Devanagari PDF character coverage", true);
  for (let index = 1; index <= 70; index += 1) assert.ok(first.text.includes(`Commitment-${String(index).padStart(3, "0")}`));
  check("All 70 approved commitments preserved without page overflow", true);
  assert.deepEqual((await exportPdf()).pages, first.pages);
  check("Repeated approved export has identical pages and text", true);
  await request(`/api/proposals/${proposal.id}/sections/scope`, "PATCH", { content: "Unapproved replacement ≥ 30%." });
  for (const format of ["markdown", "pdf"]) await request(`/api/proposals/${proposal.id}/export?format=${format}`, "GET", undefined, 409);
  check("Editing invalidates both export formats", true);
  await writeFile(join(root, "built-api-unicode.pdf"), first.bytes);
  await writeFile(join(root, "built-api-unicode.md"), markdown);
  const result = { date: new Date().toISOString(), validation: "local built API; not deployed", passed: checks.length, pageCount: first.pageCount, bytes: first.bytes.length, checks };
  await writeFile(join(root, "built-api-results.json"), JSON.stringify(result, null, 2));
  assert.deepEqual(JSON.parse(await readFile(join(root, "built-api-results.json"), "utf8")), result);
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
  await rm(working, { recursive: true, force: true });
}
