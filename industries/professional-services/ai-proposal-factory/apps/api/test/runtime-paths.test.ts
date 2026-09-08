import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRepositoryPath } from "../src/runtime-paths.js";

const repositoryRoot = resolve(process.cwd(), "../..");

describe("local runtime paths", () => {
  it("resolves default and configured relative paths from the repository root", () => {
    expect(resolveRepositoryPath(undefined, ".data/proposal-factory.json")).toBe(
      resolve(repositoryRoot, ".data/proposal-factory.json")
    );
    expect(resolveRepositoryPath("runtime/uploads", ".data/uploads")).toBe(
      resolve(repositoryRoot, "runtime/uploads")
    );
  });

  it("preserves absolute configured paths", () => {
    const absolutePath = resolve(repositoryRoot, "external-data");
    expect(resolveRepositoryPath(absolutePath, ".data/uploads")).toBe(absolutePath);
  });
});
