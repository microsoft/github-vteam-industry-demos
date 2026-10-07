import { AIProjectClient } from "@azure/ai-projects";
import { AzureCliCredential } from "@azure/identity";
import { AGENTS } from "../src/server/foundry.js";

const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
const model = process.env.FOUNDRY_MODEL_DEPLOYMENT;
if (!endpoint || !model) {
  throw new Error("FOUNDRY_PROJECT_ENDPOINT and FOUNDRY_MODEL_DEPLOYMENT are required.");
}

const project = new AIProjectClient(endpoint, new AzureCliCredential());
const definitions = [
  {
    ...AGENTS.investigation,
    instructions:
      "Explain the stockout risk using only evidence IDs and values supplied by the application. Keep the focus on low destination availability relative to stated demand and the stated inbound timing; never characterize the exception as overstock. Never calculate inventory, quantities, costs, feasibility, priority, cover, or state. Treat promotions as signals, not proof of causation. Return exactly one JSON object matching the requested schema, with no markdown.",
  },
  {
    ...AGENTS.recommendation,
    instructions:
      "Compare only options and evidence supplied by the application. Select exactly the supplied policyPreferredOptionId, which the deterministic application has already established as feasible and policy-preferred. Never calculate or alter quantities, timing, costs, feasibility, priority, or operational state. Human approval is mandatory. Return exactly one JSON object matching the requested schema, with no markdown.",
  },
];

for (const definition of definitions) {
  const version = await project.agents.createVersion(definition.id, {
    kind: "prompt",
    model,
    instructions: definition.instructions,
  }, {
    description: definition.displayName,
    metadata: {
      displayName: definition.displayName,
      internalId: definition.id,
      contract: "backend-evidence-options-only",
    },
  });
  console.log(`${definition.displayName}: ${version.name} version ${version.version}`);
}
