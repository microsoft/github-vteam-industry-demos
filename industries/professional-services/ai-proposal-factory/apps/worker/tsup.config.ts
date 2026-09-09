import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "dist",
  clean: true,
  external: [
    /@azure\/.*/,
    /^mammoth(?:\/.*)?$/,
    /^openai(?:\/.*)?$/,
    /^pdfjs-dist(?:\/.*)?$/,
    /^zod(?:\/.*)?$/,
    /^marked(?:\/.*)?$/,
    /^playwright-core(?:\/.*)?$/
  ],
  noExternal: ["@proposal-factory/contracts", "@proposal-factory/domain", "@proposal-factory/ai", "@proposal-factory/api", "@proposal-factory/azure-data"]
});
