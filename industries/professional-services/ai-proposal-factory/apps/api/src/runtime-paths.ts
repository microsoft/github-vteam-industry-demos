import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

export function resolveRepositoryPath(configuredPath: string | undefined, fallbackPath: string) {
  const targetPath = configuredPath?.trim() || fallbackPath;
  return isAbsolute(targetPath) ? targetPath : resolve(repositoryRoot, targetPath);
}
