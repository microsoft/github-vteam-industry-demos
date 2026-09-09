import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer, request as proxyRequest } from "node:http";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve, join, extname, sep } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { Buffer } from "node:buffer";
import process from "node:process";
import console from "node:console";
import { chromium } from "playwright-core";

const { fetch, URL } = globalThis;
const evidence = resolve(".data", "reliability");
const work = join(evidence, `browser-work-${process.pid}`);
await mkdir(work, { recursive: true });
for (const key of ["TEMP", "TMP", "TMPDIR"]) process.env[key] = work;
const children = [];
let browser;
let base;
const web = resolve("apps", "web", "dist");
const server = createServer(async (request, response) => {
  if (request.url.startsWith("/api/") || request.url === "/health") {
    const upstream = proxyRequest(base + request.url, {
      method: request.method, headers: request.headers
    }, (result) => { response.writeHead(result.statusCode, result.headers); result.pipe(response); });
    upstream.on("error", () => { response.writeHead(502); response.end(); });
    request.pipe(upstream);
    return;
  }
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  let file = resolve(web, `.${pathname}`);
  if (!file.startsWith(web + sep) && file !== web) { response.writeHead(404); response.end(); return; }
  if (!extname(file)) file = join(web, "index.html");
  try {
    const body = await readFile(file);
    const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
    response.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    response.end(body);
  } catch { response.writeHead(404); response.end(); }
});
async function launchApi(applicationOrigin) {
  const child = spawn(process.execPath, [resolve("apps", "api", "dist", "server.js")], {
    env: {
      ...process.env, HOST: "127.0.0.1", PORT: "0", NODE_ENV: "development", AUTH_MODE: "development",
      AUTH_DEVELOPMENT_ORIGINS: applicationOrigin,
      DATA_PROVIDER: "local", AI_PROVIDER: "fixture", LOCAL_DATA_FILE: join(work, "state.json"),
      LOCAL_UPLOAD_DIRECTORY: join(work, "uploads")
    }, stdio: ["ignore", "pipe", "pipe"]
  });
  children.push(child);
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  for (let attempt = 0; attempt < 450; attempt++) {
    const address = output.match(/Server listening at (http:\/\/127\.0\.0\.1:\d+)/)?.[1];
    if (address) { base = address; assert.equal((await fetch(base + "/health")).status, 200); return child; }
    assert.equal(child.exitCode, null, output);
    await pause(200);
  }
  throw new Error("Built API startup timed out.");
}
async function stop(child) {
  if (child.exitCode === null && child.signalCode === null) {
    const stopped = once(child, "exit"); child.kill(); await stopped;
  }
}
const results = [];
const check = (name, value) => { assert.ok(value, name); results.push(name); };
try {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const api = await launchApi(origin);
  browser = await chromium.launch({
    headless: true, ...(process.platform === "win32" ? { channel: "msedge" } : {})
  });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const editor = await context.newPage();
  const exceptions = [];
  page.on("pageerror", (error) => exceptions.push(error.message));
  editor.on("pageerror", (error) => exceptions.push(error.message));
  const approvals = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/approve")) approvals.push({ url: request.url(), body: request.postDataJSON() });
  });
  await page.goto(origin);
  await page.locator('a[href="/opportunities/opp-01"]').first().click();
  await page.getByRole("button", { name: "Generate proposal", exact: true }).click();
  await page.waitForURL("**/opportunities/opp-01/proposal");
  await page.getByRole("heading", { name: "Executive Summary", exact: true }).waitFor();
  check("Normal built-browser generation produces twelve reviewable sections", await page.locator(".proposal-section").count() === 12);
  const proposal = await (await fetch(base + "/api/opportunities/opp-01/proposal")).json();
  const scope = (tab) => tab.locator(".proposal-section").filter({ has: tab.getByRole("heading", { name: "Scope", exact: true }) });
  const editScope = async (content) => {
    await editor.goto(origin + "/opportunities/opp-01/proposal");
    await scope(editor).getByRole("button", { name: "Edit", exact: true }).click();
    await scope(editor).locator("textarea").fill(content);
    const saved = editor.waitForResponse((response) => response.request().method() === "PATCH");
    await scope(editor).getByRole("button", { name: "Save revision" }).click();
    assert.equal((await saved).status(), 200);
  };
  await editScope("Client B changed scope: only the displayed revision may be approved.");
  const staleSection = page.waitForResponse((response) => response.url().endsWith("/sections/scope/approve"));
  await scope(page).getByRole("button", { name: "Approve section" }).click();
  check("Stale section browser approval returns 409", (await staleSection).status() === 409);
  check("Request includes exact displayed revision ID",
    approvals[0].body.expectedRevisionId === proposal.sections.find((section) => section.key === "scope").currentRevisionId);
  await page.getByText(/Approval was not applied/).waitFor();
  check("Stale-review approval buttons are disabled", await scope(page).getByRole("button", { name: "Approve section" }).isDisabled());
  await page.screenshot({ path: join(evidence, "stale-section.png"), fullPage: false });
  await page.getByRole("button", { name: "Refresh proposal for review" }).click();
  await page.getByText("Client B changed scope: only the displayed revision may be approved.", { exact: true }).waitFor();
  const regenerated = page.waitForResponse((response) => response.url().endsWith("/sections/scope/regenerate"));
  await scope(page).getByRole("button", { name: "Regenerate", exact: true }).click();
  check("Normal browser regeneration succeeds", (await regenerated).status() === 200);
  for (let index = 0; index < 12; index++) {
    const [approval] = await Promise.all([
      page.waitForResponse((response) => response.url().includes("/sections/") && response.url().endsWith("/approve")),
      page.getByRole("button", { name: "Approve section", exact: true }).first().click()
    ]);
    assert.equal(approval.status(), 200);
    await page.getByText(`${index + 1} of 12 sections approved`, { exact: true }).waitFor();
  }
  await page.getByText("12 of 12 sections approved", { exact: true }).waitFor();
  const reviewed = await (await fetch(base + `/api/proposals/${proposal.id}`)).json();
  await editScope("Intervening fully approved scope revision ≥ 20%.");
  const reapproved = editor.waitForResponse((response) => response.url().endsWith("/sections/scope/approve"));
  await scope(editor).getByRole("button", { name: "Approve section" }).click();
  assert.equal((await reapproved).status(), 200);
  const staleComplete = page.waitForResponse((response) => response.url().endsWith(`/proposals/${proposal.id}/approve`));
  await page.getByRole("button", { name: "Approve complete proposal" }).click();
  check("Stale complete browser approval rejects intervening edit and reapproval", (await staleComplete).status() === 409);
  check("Complete request includes displayed review-set version", approvals.at(-1).body.expectedReviewVersion === reviewed.reviewVersion);
  await page.getByText(/Approval was not applied/).waitFor();
  await page.screenshot({ path: join(evidence, "stale-complete.png"), fullPage: false });
  await page.getByRole("button", { name: "Refresh proposal for review" }).click();
  await page.getByText("Intervening fully approved scope revision ≥ 20%.", { exact: true }).waitFor();
  const complete = page.waitForResponse((response) => response.url().endsWith(`/proposals/${proposal.id}/approve`));
  await page.getByRole("button", { name: "Approve complete proposal" }).click();
  check("Complete approval succeeds after explicit refresh and review", (await complete).status() === 200);
  for (const format of ["Markdown", "PDF"]) {
    const downloading = page.waitForEvent("download");
    await page.getByRole("button", { name: `Export ${format}` }).click();
    const download = await downloading;
    const path = join(evidence, `review-approved.${format === "PDF" ? "pdf" : "md"}`);
    await download.saveAs(path);
    const body = await readFile(path);
    check(`Normal browser ${format} export succeeds`, format === "PDF"
      ? body.subarray(0, 5).equals(Buffer.from("%PDF-"))
      : body.toString().includes("Intervening fully approved scope revision ≥ 20%."));
  }
  const beforeRestart = await (await fetch(base + `/api/proposals/${proposal.id}`)).json();
  const audit = await (await fetch(base + "/api/audit")).json();
  check("Audit records exact approved revision set", audit.filter((event) => event.type === "Proposal Approved").length === 1 &&
    audit.find((event) => event.type === "Proposal Approved").metadata.reviewVersion === beforeRestart.reviewVersion);
  check("Built local audit actor is the explicit development identity", audit.every((event) =>
    event.actorType === "Development" && event.actorId === "11111111-1111-4111-8111-111111111111"));
  await page.getByRole("link", { name: "Audit history" }).click();
  await page.getByRole("heading", { name: "Audit history", exact: true }).waitFor();
  await stop(api);
  await launchApi(origin);
  const retried = await fetch(base + `/api/proposals/${proposal.id}/approve`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ expectedReviewVersion: beforeRestart.reviewVersion })
  });
  check("Approval retry survives a real built API process restart", retried.status === 200);
  assert.deepEqual(await retried.json(), beforeRestart);
  check("Restart retry does not duplicate audit", (await (await fetch(base + "/api/audit")).json()).length === audit.length);
  check("No uncaught browser exceptions", exceptions.length === 0);
  await writeFile(join(evidence, "browser-results.json"), JSON.stringify({
    verifiedAt: new Date().toISOString(), browser: browser.version(), checks: results,
    providers: { data: "local", ai: "fixture", auth: "development" },
    topology: "Built web assets + built API via loopback Node proxy, not Linux/Nginx or Azure"
  }, null, 2));
  console.log(`PASS built review browser smoke: ${results.length} checks; evidence .data\\reliability\\browser-results.json`);
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
  await Promise.all(children.map(stop));
  await rm(work, { recursive: true, force: true });
}
