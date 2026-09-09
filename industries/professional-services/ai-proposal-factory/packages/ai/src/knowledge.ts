import { createHash } from "node:crypto";
import type { ReusableContent } from "@proposal-factory/contracts";
import { z } from "zod";
import { AiError } from "./errors.js";

export const CORPUS_VERSION = "synthetic-v1";
export const knowledgeSchema = z.object({
  id: z.string().regex(/^chunk-[0-9a-f]{32}$/),
  sourceId: z.string().min(1).max(200),
  sourceVersion: z.string().min(1).max(200),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  corpus: z.literal(CORPUS_VERSION),
  status: z.literal("published"),
  sourceType: z.literal("synthetic"),
  title: z.string().min(1).max(300),
  kind: z.enum(["Proposal Snippet", "Case Study", "Delivery Methodology", "Service Description", "Pricing Assumption"]),
  scenario: z.enum(["Cloud modernization", "AI adoption", "Data platform modernization", "Application modernization", "Customer service transformation"]),
  industries: z.array(z.string().min(1).max(100)).min(1).max(30),
  serviceTags: z.array(z.string().min(1).max(100)).max(30),
  body: z.string().min(1).max(1800),
  chunkOrdinal: z.number().int().min(0).max(999),
  embeddingVersion: z.string().max(100),
  embeddingDimensions: z.number().int().min(0).max(3072),
  embedding: z.array(z.number()).optional()
});
export type KnowledgeChunk = z.infer<typeof knowledgeSchema>;

export const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const chunkId = (sourceId: string, ordinal: number) => `chunk-${hash(`${CORPUS_VERSION}:${sourceId}:${ordinal}`).slice(0, 32)}`;
export const chunkHash = (chunk: Pick<KnowledgeChunk, "sourceId" | "sourceVersion" | "title" | "kind" | "scenario" | "industries" | "serviceTags" | "body" | "chunkOrdinal">) =>
  hash(JSON.stringify([chunk.sourceId, chunk.sourceVersion, chunk.title, chunk.kind, chunk.scenario,
    chunk.industries, chunk.serviceTags, chunk.body, chunk.chunkOrdinal]));

export function validateChunk(value: unknown): KnowledgeChunk {
  const result = knowledgeSchema.safeParse(value);
  if (!result.success || result.data.id !== chunkId(result.data.sourceId, result.data.chunkOrdinal) ||
      result.data.contentHash !== chunkHash(result.data)) {
    throw new AiError("INVALID_SOURCE", "Search returned a malformed or inconsistent source chunk.");
  }
  return result.data;
}

export function chunkContent(content: ReusableContent): KnowledgeChunk[] {
  const text = content.body.replaceAll("\r\n", "\n").trim();
  if (!text || text.length > 1_000_000) throw new AiError("INVALID_SOURCE", "Reusable source body is empty or too large.");
  const chunks: KnowledgeChunk[] = [];
  // Fixed, overlapping windows make IDs stable for identical seeded source revisions.
  for (let start = 0, ordinal = 0; start < text.length; start += 1600, ordinal++) {
    const chunk = {
      id: chunkId(content.id, ordinal), sourceId: content.id, sourceVersion: content.updatedAt,
      corpus: CORPUS_VERSION, sourceType: "synthetic" as const, status: "published" as const,
      title: content.title, kind: content.kind, scenario: content.scenario,
      industries: [...new Set(content.industries)].sort(), serviceTags: [...new Set(content.tags)].sort(),
      body: text.slice(start, start + 1800), chunkOrdinal: ordinal,
      embeddingVersion: "", embeddingDimensions: 0, contentHash: ""
    };
    chunk.contentHash = chunkHash(chunk);
    chunks.push(validateChunk(chunk));
    if (start + 1800 >= text.length) break;
  }
  return chunks;
}
