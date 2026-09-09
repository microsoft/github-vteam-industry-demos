import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = new Set();
let stopping = false;

function startWorkspace(name) {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : npmCommand;
  const args =
    process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run dev -w ${name}`]
      : ["run", "dev", "-w", name];
  const child = spawn(command, args, {
    env: process.env,
    stdio: "inherit"
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function stopChildren() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill("SIGTERM");
}

function exited(child) {
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function waitForUrl(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "No response received.";

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${url}: ${lastError}`);
}

process.once("SIGINT", () => {
  stopChildren();
  process.exitCode = 130;
});
process.once("SIGTERM", () => {
  stopChildren();
  process.exitCode = 143;
});
process.once("exit", stopChildren);

const api = startWorkspace("@proposal-factory/api");
const apiExit = exited(api);

try {
  await Promise.race([
    waitForUrl("http://127.0.0.1:3001/health", Number(process.env.DEV_STARTUP_TIMEOUT_MS ?? 120_000)),
    apiExit.then(({ code, signal }) => {
      throw new Error(`API exited before becoming ready (${signal ?? code ?? "unknown"}).`);
    })
  ]);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  stopChildren();
  process.exit(1);
}

const web = startWorkspace("@proposal-factory/web");
const result = await Promise.race([apiExit, exited(web)]);
stopChildren();
process.exitCode = result.code ?? (result.signal ? 1 : 0);
