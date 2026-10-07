import { AIProjectClient } from "@azure/ai-projects";
import { AzureCliCredential, ManagedIdentityCredential } from "@azure/identity";
import {
  investigationAgentOutputSchema,
  recommendationAgentOutputSchema,
  type Investigation,
  type Recommendation,
} from "../shared/contracts.js";
import type { EvidenceItem } from "../shared/domain.js";
import type { ActionOption } from "../shared/contracts.js";
import type { AppConfig } from "./config.js";

export const AGENTS = {
  investigation: {
    id: "inventory-investigation",
    displayName: "Inventory Investigation",
  },
  recommendation: {
    id: "replenishment-recommendation",
    displayName: "Replenishment Recommendation",
  },
} as const;

export const PROMOTION_NON_CAUSATION_CAVEAT =
  "Promotion is supporting evidence, not proof of causation.";

export interface AgentInvoker {
  investigate(evidence: EvidenceItem[]): Promise<Investigation>;
  recommend(evidence: EvidenceItem[], options: ActionOption[]): Promise<Recommendation>;
  configured(): boolean;
}

function unavailableInvestigation(reason: string): Investigation {
  return {
    status: "unavailable",
    summary: reason,
    evidenceIds: [],
    caveats: ["Deterministic evidence remains available; no AI explanation was produced."],
    agent: "Inventory Investigation",
  };
}

function unavailableRecommendation(reason: string): Recommendation {
  return {
    status: "unavailable",
    summary: reason,
    selectedOptionId: null,
    consideredOptionIds: [],
    evidenceIds: [],
    tradeoffs: ["Use deterministic option calculations and planner judgment."],
    agent: "Replenishment Recommendation",
  };
}

const PROMOTION_SIGNAL_TEXT = "Promotion appears in the supplied evidence as a signal";
const promotionTerm = String.raw`\b(?:promotions?|campaigns?|edits?)\b`;
const promotionReference = String.raw`(?:(?:the|a|an)\s+)?(?:(?:local|seasonal|synthetic|scheduled|supplied|observed)\s+){0,3}${promotionTerm}`;
const outcomeTerm = String.raw`\b(?:shortages?|stockouts?|exceptions?|risks?|gaps?|shortfalls?|low\s+cover|inventory\s+(?:risk|gap|shortfall|exception)|availability\s+(?:risk|gap|decline)|revenue\s+exposure|(?:higher|increased|elevated|lower|reduced|unexpected|additional|new)\s+(?:demand|sales|revenue|orders?|risk|exposure)|demand(?!\s+(?:report|analysis|dashboard|file|dataset|forecast|summary))|sales(?!\s+(?:report|analysis|dashboard|file|dataset|forecast|summary))|revenue(?!\s+(?:report|analysis|dashboard|file|dataset|forecast|summary))|orders?|conversions?|units?\s+sold|increases?|decreases?|spikes?|surges?|outcomes?)\b`;
const activeModifier = String.raw`(?:(?:itself|directly|indirectly|likely|apparently|possibly|materially|significantly|may|might|could|can|has|have|had|would)\s+){0,4}`;
const unsupportedPromotionRelationships = [
  new RegExp(
    `${promotionTerm}.{0,40}\\b(?:caus(?:e|es|ed|ing)|drove|drive|drives|driven|lead(?:s|ing)?\\s+to|led\\s+to|result(?:s|ed|ing)?\\s+in|trigger(?:s|ed|ing)?|boost(?:s|ed|ing)?)\\b.{0,60}${outcomeTerm}`,
    "i",
  ),
  new RegExp(
    `${promotionTerm}\\s+${activeModifier}(?:contribut(?:e|es|ed|ing)\\s+(?:to|toward|towards)|creat(?:e|es|ed|ing)|generat(?:e|es|ed|ing)|explain(?:s|ed|ing)?)\\b.{0,60}${outcomeTerm}`,
    "i",
  ),
  new RegExp(
    `${promotionTerm}.{0,20}\\b(?:(?:is|are|was|were)\\s+|(?:has|have|had)\\s+been\\s+)(?:contributing\\s+(?:to|toward|towards)|creating|generating|explaining)\\b.{0,60}${outcomeTerm}`,
    "i",
  ),
  new RegExp(
    `${outcomeTerm}.{0,60}\\b(?:caus(?:ed)?|driven|triggered|boosted|created|generated|explained)\\s+(?:by|because\\s+of|due\\s+to)\\s+${promotionReference}`,
    "i",
  ),
  new RegExp(
    `${outcomeTerm}.{0,60}\\b(?:attribut(?:e|es|ed|ing)|attributable)\\s+(?:primarily\\s+|partly\\s+|partially\\s+)?to\\s+${promotionReference}`,
    "i",
  ),
  new RegExp(
    `\\battribut(?:e|es|ed|ing)\\b.{0,40}${outcomeTerm}.{0,30}\\bto\\s+${promotionReference}`,
    "i",
  ),
  new RegExp(
    `${outcomeTerm}.{0,60}\\b(?:result(?:s|ed|ing)?\\s+from|due\\s+to|because\\s+of)\\s+${promotionReference}`,
    "i",
  ),
  new RegExp(
    `${outcomeTerm}.{0,60}\\b(?:contribution|contributions)\\s+from\\s+${promotionReference}`,
    "i",
  ),
];
const canonicalCaveatPattern =
  /Promotion is supporting evidence, not proof of causation\./gi;

export function hasUnsupportedPromotionCausation(text: string): boolean {
  return unsupportedPromotionRelationships.some((pattern) => pattern.test(text));
}

function neutralizePromotionCausation(text: string): string {
  const withoutCanonical = text
    .replace(canonicalCaveatPattern, "")
    .replace(/\s+([,;:.!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!withoutCanonical) return "";

  return (withoutCanonical.match(/[^,;.!?\n]+[,;.!?]?|\n+/g) ?? [withoutCanonical])
    .map((clause) => {
      if (
        clause.trim() &&
        hasUnsupportedPromotionCausation(clause)
      ) {
        const leadingWhitespace = clause.match(/^\s*/)?.[0] ?? "";
        const terminalPunctuation = clause.match(/[,;.!?]$/)?.[0] ?? "";
        return `${leadingWhitespace}${PROMOTION_SIGNAL_TEXT}${terminalPunctuation}`;
      }
      return clause;
    })
    .join("")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function guardPromotionCausation(
  summary: string,
  supportingText: string[],
  evidence: EvidenceItem[],
): { summary: string; supportingText: string[] } {
  if (!evidence.some((item) => item.kind === "promotion")) {
    return { summary, supportingText };
  }
  const safeSummary =
    neutralizePromotionCausation(summary) || `${PROMOTION_SIGNAL_TEXT}.`;
  const normalizedSupportingText = supportingText
    .map(neutralizePromotionCausation)
    .filter((item) => item.length > 0);
  const safeSupportingText = [
    ...normalizedSupportingText,
    PROMOTION_NON_CAUSATION_CAVEAT,
  ];
  return { summary: safeSummary, supportingText: safeSupportingText };
}

export function validateInvestigationOutput(
  raw: unknown,
  evidence: EvidenceItem[],
): Investigation {
  const parsed = investigationAgentOutputSchema.parse(raw);
  const allowedEvidence = new Set(evidence.map((item) => item.id));
  if (parsed.evidenceIds.some((id) => !allowedEvidence.has(id))) {
    throw new Error("Agent cited evidence outside supplied boundaries.");
  }
  const guarded = guardPromotionCausation(parsed.summary, parsed.caveats, evidence);
  return {
    status: "available",
    ...parsed,
    summary: guarded.summary,
    caveats: guarded.supportingText,
    agent: "Inventory Investigation",
  };
}

export function validateRecommendationOutput(
  raw: unknown,
  evidence: EvidenceItem[],
  options: ActionOption[],
  policyPreferredOptionId?: string,
): Recommendation {
  const parsed = recommendationAgentOutputSchema.parse(raw);
  const allowedEvidence = new Set(evidence.map((item) => item.id));
  const allowedOptions = new Set(options.map((option) => option.id));
  if (
    !allowedOptions.has(parsed.selectedOptionId) ||
    parsed.consideredOptionIds.some((id) => !allowedOptions.has(id)) ||
    parsed.evidenceIds.some((id) => !allowedEvidence.has(id))
  ) {
    throw new Error("Agent output exceeded supplied evidence or option boundaries.");
  }
  const selected = options.find((option) => option.id === parsed.selectedOptionId);
  if (!selected?.feasible) throw new Error("Agent selected an infeasible option.");
  if (policyPreferredOptionId && parsed.selectedOptionId !== policyPreferredOptionId) {
    throw new Error("Agent did not select the deterministic policy-preferred option.");
  }
  const guarded = guardPromotionCausation(parsed.summary, parsed.tradeoffs, evidence);
  return {
    status: "available",
    ...parsed,
    summary: guarded.summary,
    tradeoffs: guarded.supportingText,
    agent: "Replenishment Recommendation",
  };
}

export class FoundryAgentInvoker implements AgentInvoker {
  private readonly project?: AIProjectClient;

  constructor(private readonly config: AppConfig) {
    if (config.foundryProjectEndpoint && config.foundryModelDeployment) {
      const credential =
        config.environment === "azure"
          ? config.managedIdentityClientId
            ? new ManagedIdentityCredential(config.managedIdentityClientId)
            : new ManagedIdentityCredential()
          : new AzureCliCredential();
      this.project = new AIProjectClient(config.foundryProjectEndpoint, credential);
    }
  }

  configured(): boolean {
    return Boolean(this.project);
  }

  private async invoke(
    agentName: string,
    input: unknown,
    schema: Record<string, unknown>,
    schemaName: string,
  ) {
    if (!this.project) throw new Error("Microsoft Foundry is not configured.");
    const client = this.project.getOpenAIClient();
    const operation = client.responses.create(
      {
        input: JSON.stringify({
          request: input,
          responseContract: {
            format: "Return one JSON object only, with no markdown or additional text.",
            schemaName,
            schema,
          },
        }),
        stream: false,
      },
      { body: { agent_reference: { name: agentName, type: "agent_reference" } } },
    );
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Foundry request timed out.")), this.config.agentTimeoutMs);
    });
    const response = await Promise.race([operation, timeout]);
    return JSON.parse(response.output_text);
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return operation();
    }
  }

  async investigate(evidence: EvidenceItem[]): Promise<Investigation> {
    try {
      const raw = await this.withRetry(() =>
        this.invoke(
          AGENTS.investigation.id,
          { task: "Explain the inventory risk using only supplied evidence.", evidence },
          {
            type: "object",
            properties: {
              summary: { type: "string" },
              evidenceIds: { type: "array", items: { type: "string" } },
              caveats: { type: "array", items: { type: "string" }, maxItems: 8 },
            },
            required: ["summary", "evidenceIds", "caveats"],
            additionalProperties: false,
          },
          "InventoryInvestigation",
        ),
      );
      return validateInvestigationOutput(raw, evidence);
    } catch (error) {
      return unavailableInvestigation(
        `AI investigation unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  async recommend(evidence: EvidenceItem[], options: ActionOption[]): Promise<Recommendation> {
    try {
      const policyPreferredOptionId =
        options.find((option) => option.type === "store-transfer" && option.feasible)?.id ??
        options.find((option) => option.feasible)?.id;
      if (!policyPreferredOptionId) throw new Error("No feasible option is available.");
      const raw = await this.withRetry(() =>
        this.invoke(
          AGENTS.recommendation.id,
          {
            task: "Recommend one supplied feasible option without changing any calculated value.",
            policyPreferredOptionId,
            evidence,
            options,
          },
          {
            type: "object",
            properties: {
              summary: { type: "string" },
              selectedOptionId: { type: "string" },
              consideredOptionIds: { type: "array", items: { type: "string" } },
              evidenceIds: { type: "array", items: { type: "string" } },
              tradeoffs: { type: "array", items: { type: "string" }, maxItems: 8 },
            },
            required: [
              "summary",
              "selectedOptionId",
              "consideredOptionIds",
              "evidenceIds",
              "tradeoffs",
            ],
            additionalProperties: false,
          },
          "ReplenishmentRecommendation",
        ),
      );
      return validateRecommendationOutput(raw, evidence, options, policyPreferredOptionId);
    } catch (error) {
      return unavailableRecommendation(
        `AI recommendation unavailable: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }
}
