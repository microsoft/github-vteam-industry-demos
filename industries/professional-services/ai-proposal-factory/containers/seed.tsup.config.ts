import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["containers/seed-entrypoint.ts"],
  format: ["esm"],
  platform: "node",
  target: "node24",
  outDir: "containers/dist",
  clean: true,
  external: [
    /@azure\/.*/,
    /^openai(?:\/.*)?$/,
    /^zod(?:\/.*)?$/,
    /^mammoth(?:\/.*)?$/,
    /^pdfjs-dist(?:\/.*)?$/,
    /^marked(?:\/.*)?$/,
    /^playwright-core(?:\/.*)?$/
  ],
  noExternal: [
    "@proposal-factory/api",
    "@proposal-factory/ai",
    "@proposal-factory/azure-data",
    "@proposal-factory/contracts",
    "@proposal-factory/domain"
  ]
});
