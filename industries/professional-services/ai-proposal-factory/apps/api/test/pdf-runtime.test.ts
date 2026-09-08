import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import apiBuild from "../tsup.config.js";
import workerBuild from "../../worker/tsup.config.js";
import seedBuild from "../../../containers/seed.tsup.config.js";

const root = new URL("../../../", import.meta.url);
const read = (file: string) => readFileSync(new URL(file, root), "utf8");
const lock = JSON.parse(read("package-lock.json"));

describe("PDF production runtime contract", () => {
  it.each([
    ["API", apiBuild],
    ["worker", workerBuild],
    ["seed", seedBuild]
  ])("keeps browser and Markdown dependencies external in the %s build", (_name, config) => {
    expect(typeof config).toBe("object");
    const external = (config as { external: (string | RegExp)[] }).external;
    for (const dependency of ["marked", "playwright-core", "playwright-core/lib/coreBundle"]) {
      expect(external.some((entry) => typeof entry === "string" ? entry === dependency : entry.test(dependency))).toBe(true);
    }
  });

  it.each(["api", "worker", "seed"])("retains and verifies external runtime packages in the %s image", (image) => {
    const dockerfile = read(`containers/Dockerfile.${image}`);
    expect(dockerfile).toContain("npm ci --omit=dev");
    expect(dockerfile).toContain("/workspace/node_modules ./node_modules");
    if (image === "api") {
      expect(lock.packages["apps/api/node_modules/fastify"].dev).not.toBe(true);
      expect(dockerfile).toContain("/workspace/apps/api/node_modules ./apps/api/node_modules");
    }
    for (const dependency of ["marked", "playwright-core"]) {
      expect(lock.packages["apps/api"].dependencies[dependency]).toBeDefined();
      expect(lock.packages[`node_modules/${dependency}`].dev).not.toBe(true);
      expect(dockerfile).toContain(`import('${dependency}')`);
    }
    expect(dockerfile).not.toContain("import('pdf-lib')");
  });

  it("includes the API browser and font assets but does not install browsers in worker/seed images", () => {
    const api = read("containers/Dockerfile.api");
    for (const dependency of ["chromium", "fontconfig", "fonts-noto-core", "fonts-noto-extra", "fonts-noto-cjk", "fonts-noto-color-emoji"]) {
      expect(api).toContain(`      ${dependency}`);
    }
    expect(api).toContain("PDF_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium");
    for (const image of ["worker", "seed"]) {
      expect(read(`containers/Dockerfile.${image}`)).not.toContain("      chromium");
    }
  });
});
