import { z } from "zod";
import { proposalSectionKeys, type Citation, type ProposalSectionKey } from "@proposal-factory/contracts";
import { AiError } from "./errors.js";

const strings = z.array(z.string());
export const requirementsSchema = z.object({
  businessGoals: strings,
  businessProblems: strings,
  scope: strings,
  stakeholders: strings,
  constraints: strings,
  successCriteria: strings,
  timelines: strings,
  openQuestions: strings,
  documentIds: strings
}).strict();
export type RequirementsAnalysis = z.infer<typeof requirementsSchema>;

export const sectionSchema = z.object({ content: z.string(), citationIds: strings }).strict();
export type DraftSection = z.infer<typeof sectionSchema>;
const sectionShape = Object.fromEntries(proposalSectionKeys.map((key) => [key, sectionSchema])) as Record<ProposalSectionKey, typeof sectionSchema>;
export const draftSchema = z.object({ sections: z.object(sectionShape).strict() }).strict();
export type StructuredDraft = z.infer<typeof draftSchema>;

export const riskSchema = z.object({
  findings: z.array(z.object({
    severity: z.enum(["Low", "Medium", "High"]),
    category: z.enum(["Assumption", "Delivery Risk", "Dependency", "Missing Information", "Open Question"]),
    title: z.string(), description: z.string(), mitigation: z.string(), citationIds: strings
  }).strict())
}).strict();
export type RiskReview = z.infer<typeof riskSchema>;

export function parseOutput<T>(schema: z.ZodType<T>, value: unknown): T {
  let parsed: unknown = value;
  try { if (typeof value === "string") parsed = JSON.parse(value); }
  catch { throw new AiError("INVALID_MODEL_OUTPUT", "Model output is not valid JSON."); }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new AiError("INVALID_MODEL_OUTPUT", "Model output failed the required schema.");
  validateSize(result.data);
  return result.data;
}

function validateSize(value: unknown): void {
  if (typeof value === "string" && (!value.trim() || value.length > 16000)) {
    throw new AiError("INVALID_MODEL_OUTPUT", "Model text is empty or exceeds the section limit.");
  }
  if (Array.isArray(value)) {
    if (value.length > 50) throw new AiError("INVALID_MODEL_OUTPUT", "Model array exceeds the item limit.");
    value.forEach(validateSize);
  } else if (value && typeof value === "object") Object.values(value).forEach(validateSize);
}

export function validateSection(section: DraftSection, citations: Citation[]): DraftSection {
  const parsed = parseOutput(sectionSchema, section);
  const allowed = new Set(citations.map((citation) => citation.id));
  if (new Set(parsed.citationIds).size !== parsed.citationIds.length ||
      parsed.citationIds.some((id) => !allowed.has(id))) {
    throw new AiError("INVALID_CITATION", "Model referenced a source outside the retrieved evidence.");
  }
  const inline = [...parsed.content.matchAll(/\[source:([^\]]+)\]/g)].map((match) => match[1]);
  const markerCount = parsed.content.match(/\[source:/g)?.length ?? 0;
  if (inline.length !== markerCount || inline.some((id) => !id || !parsed.citationIds.includes(id))) {
    throw new AiError("INVALID_CITATION", "Inline citations must match the section evidence list.");
  }
  return parsed;
}

export function validateDraft(draft: StructuredDraft, citations: Citation[]): StructuredDraft {
  const parsed = parseOutput(draftSchema, draft);
  for (const key of proposalSectionKeys) validateSection(parsed.sections[key], citations);
  return parsed;
}

export function validateRequirements(value: RequirementsAnalysis, documentIds: string[]): RequirementsAnalysis {
  const parsed = parseOutput(requirementsSchema, value);
  if (parsed.businessGoals.length === 0 || parsed.businessProblems.length === 0 || parsed.scope.length === 0) {
    throw new AiError("INVALID_MODEL_OUTPUT", "Requirements must include goals, problems and scope.");
  }
  if (parsed.documentIds.some((id) => !documentIds.includes(id))) {
    throw new AiError("INVALID_SOURCE", "Requirements referenced an unselected customer document.");
  }
  return parsed;
}

export function validateRisks(value: RiskReview, citations: Citation[]): RiskReview {
  const parsed = parseOutput(riskSchema, value);
  for (const finding of parsed.findings) {
    validateSection({ content: `${finding.description}\n${finding.mitigation}`, citationIds: finding.citationIds }, citations);
  }
  return parsed;
}
