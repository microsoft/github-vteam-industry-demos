import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createSeedData } from "../src/server/data/seed.js";

const output = resolve("data/seed.json");
await mkdir(resolve("data"), { recursive: true });
await writeFile(output, `${JSON.stringify(createSeedData(), null, 2)}\n`, "utf8");
console.log(`Wrote deterministic seed to ${output}`);
