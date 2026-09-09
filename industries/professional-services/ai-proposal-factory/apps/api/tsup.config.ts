import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts"],
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
  noExternal: ["@proposal-factory/azure-data", "@proposal-factory/contracts", "@proposal-factory/domain", "@proposal-factory/ai"]
});
