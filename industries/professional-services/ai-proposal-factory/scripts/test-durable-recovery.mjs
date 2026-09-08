import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { setTimeout, clearTimeout } from "node:timers";
import process from "node:process";
import console from "node:console";

const { AbortController } = globalThis;
const phase = process.argv[2];
if (!phase) {
  const evidence = resolve(".data", "reliability");
  const work = join(evidence, `durable-work-${process.pid}`);
  await mkdir(work, { recursive: true });
  const stateFile = join(work, "durable-store.json");
  const results = [];
  try {
    for (const step of ["submit", "dispatch-restart", "recover"]) {
      const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), step, stateFile], {
        env: {
          ...process.env, AUTH_MODE: "development", NODE_ENV: "development",
          AUTH_DEVELOPMENT_ORIGINS: "http://127.0.0.1:5173", TEMP: work, TMP: work, TMPDIR: work
        },
        stdio: ["ignore", "pipe", "pipe"]
      });
      let output = "";
      child.stdout.on("data", (data) => { output += data; });
      child.stderr.on("data", (data) => { output += data; });
      const timer = setTimeout(() => child.kill(), 120000);
      const code = await new Promise((done, fail) => { child.on("error", fail); child.on("exit", done); });
      clearTimeout(timer);
      assert.equal(code, 0, output);
      results.push({ phase: step, output: output.trim() });
    }
    const persisted = JSON.parse(await readFile(stateFile, "utf8"));
    assert.equal(persisted.queue.length, 0);
    assert.equal(persisted.poison.length, 0);
    assert.equal(persisted.modelAnalyses, 1);
    assert.equal(persisted.acknowledgements, 2);
    await writeFile(join(evidence, "durable-results.json"), JSON.stringify({
      verifiedAt: new Date().toISOString(), results, modelAnalyses: persisted.modelAnalyses,
      acknowledgements: persisted.acknowledgements, remainingQueueDepth: persisted.queue.length,
      topology: "Three real Node processes; file-backed offline Cosmos/Queue boundary; built worker/runtime recovery",
      limitations: "No Azure services, managed identity, deployment or final Linux images exercised."
    }, null, 2));
    console.log("PASS offline durable smoke: empty queue, API/worker process restarts, autonomous dispatch, duplicates, completion-last.");
  } finally { await rm(work, { recursive: true, force: true }); }
} else {
  const { offlineData, offlineEnvironment } = await import("./reliability-offline-store.mjs");
  const { data, state, persist } = offlineData(process.argv[3]);
  if (phase === "submit") {
    const { createFixtureContent, createFixtureOpportunities } = await import("../apps/api/src/fixtures.ts");
    const { createAzureApplicationRuntime } = await import("../apps/api/src/ai-azure-runtime.ts");
    const { createApp } = await import("../apps/api/src/app.ts");
    await data.repositories.opportunities.save(createFixtureOpportunities()[0]);
    for (const content of createFixtureContent()) await data.repositories.content.save(content);
    const runtime = createAzureApplicationRuntime(offlineEnvironment, { data });
    const { app } = await createApp({
      store: runtime.store, ai: runtime.ai, workflow: runtime.workflow, ids: runtime.ids, dataProvider: "azure"
    });
    data.queue.enqueue = async () => { throw { code: 503 }; };
    try {
      const accepted = await app.inject({ method: "POST", url: "/api/opportunities/opp-01/proposals/generate" });
      assert.equal(accepted.statusCode, 500);
      const active = await runtime.state.readValue("opportunity:opp-01");
      state.jobId = active.jobId;
      state.immutableInput = await runtime.state.loadJob(state.jobId);
      persist();
      assert.equal(state.queue.length, 0);
      assert.equal((await runtime.state.record(state.jobId)).dispatched, false);
      console.log("Persisted immutable API job/outbox after failed enqueue; queue depth zero; API now exits.");
    } finally { await app.close(); }
  } else {
    const workerDirectory = resolve("apps", "worker", "dist");
    const runtimeFile = (await readdir(workerDirectory)).find((name) => /^ai-azure-runtime-.*\.js$/.test(name));
    assert.ok(runtimeFile, "Run npm run build before this smoke.");
    const { createAzureApplicationRuntime } = await import(pathToFileURL(join(workerDirectory, runtimeFile)).href);
    const { GenerationWorkHandler, runWorker } = await import("../apps/worker/dist/index.js");
    const runtime = createAzureApplicationRuntime(offlineEnvironment, { data });
    const controller = new AbortController();
    const analyze = runtime.ai.orchestrator.provider.analyze.bind(runtime.ai.orchestrator.provider);
    runtime.ai.orchestrator.provider.analyze = async (...args) => {
      state.modelAnalyses++; persist();
      return analyze(...args);
    };
    let failures = 0;
    if (phase === "dispatch-restart") {
      assert.equal(state.queue.length, 0);
      const enqueue = data.queue.enqueue.bind(data.queue);
      let failEnqueue = true;
      data.queue.enqueue = async (message) => {
        if (failEnqueue) { failEnqueue = false; throw { code: 503 }; }
        await enqueue(message);
      };
      const update = runtime.state.updateRecord.bind(runtime.state);
      runtime.state.updateRecord = async (id, change) => {
        const record = await runtime.state.record(id);
        if (!record.dispatched && change(record).dispatched) throw { code: 503 };
        return update(id, change);
      };
      const receive = data.queue.receive.bind(data.queue);
      data.queue.receive = async () => {
        if (state.queue.length) { controller.abort(); return undefined; }
        return receive();
      };
    } else {
      assert.equal(phase, "recover");
      assert.equal(state.queue.length, 1);
      assert.equal((await runtime.state.record(state.jobId)).dispatched, false);
      const complete = data.queue.complete.bind(data.queue);
      data.queue.complete = async (message) => {
        assert.equal((await data.repositories.generationRuns.get(state.jobId)).status, "Complete");
        assert.equal((await data.repositories.proposals.getByOpportunity("opp-01")).sections.length, 12);
        assert.equal((await data.repositories.audit.list("opp-01")).filter((event) => event.type === "Proposal Generated").length, 1);
        await complete(message);
        if (!state.queue.length) controller.abort();
      };
    }
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      await runWorker(data.queue, new GenerationWorkHandler({ run: (job) => runtime.workflow.execute(job) }, runtime.workflow), {
        signal: controller.signal, idleMs: 100, dispatchIntervalMs: 100,
        dispatchPending: () => runtime.workflow.dispatchPending(), onError: () => failures++
      });
      assert.deepEqual(await runtime.state.loadJob(state.jobId), state.immutableInput);
      if (phase === "dispatch-restart") {
        assert.equal(failures, 2);
        assert.equal(state.queue.length, 1);
        assert.equal((await runtime.state.record(state.jobId)).dispatched, false);
        console.log("Built worker autonomously recovered zero queue; survived transient dispatch failure; exits after enqueue-before-marker failure.");
      } else {
        assert.equal(failures, 0);
        assert.equal(await runtime.workflow.isCommitted(state.jobId), true);
        assert.equal(state.modelAnalyses, 1);
        assert.equal(state.acknowledgements, 2);
        console.log("Restarted built worker dispatched duplicate, executed model once, published content/audit before completion, drained both deliveries.");
      }
    } finally { clearTimeout(timeout); controller.abort(); }
  }
}
