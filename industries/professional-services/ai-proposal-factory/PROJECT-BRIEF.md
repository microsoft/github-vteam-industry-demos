I want you to lead the design, implementation, Azure provisioning, deployment, and validation of a complete working prototype for a Professional Services customer demo.

Project name:
AI Proposal Factory

## Context and purpose

This project is part of a GitHub Copilot initiative for Professional Services customers.

The goal is not only to demonstrate the final application. The project must also showcase how quickly a real business solution can be created and extended using GitHub Copilot CLI and Squad.

The final application should therefore:

1. Be polished and functional enough to demonstrate to customers as a complete solution.
2. Solve a realistic Professional Services business problem.
3. Be fully deployed and running in my Azure development subscription.
4. Be structured cleanly enough that GitHub Copilot can easily add new functionality during a live customer demo.
5. Intentionally leave several useful, realistic enhancement opportunities that can be implemented live with GitHub Copilot in a few minutes.

You are responsible for coordinating the engineering work. Cast the Squad members you need for architecture, frontend, backend, Azure infrastructure, AI/RAG, security, testing, and DevOps.

Do not confuse the Squad development team with the runtime AI agents described below.

---

# Business scenario

A consulting or Professional Services firm needs to respond to customer opportunities faster.

Sales and delivery teams currently spend significant time manually searching through:

- previous proposals
- statements of work
- meeting notes
- case studies
- project plans
- service descriptions
- delivery methodologies
- pricing and effort assumptions

This results in:

- slow proposal creation
- inconsistent proposal quality
- duplicated work
- difficulty reusing organizational knowledge
- dependency on senior consultants
- inconsistent risk identification
- limited visibility into how proposal content was created

The AI Proposal Factory should demonstrate how AI can accelerate this process while keeping a human reviewer in control.

---

# Target user experience

Build a modern and polished web application suitable for a live customer demonstration.

The application should have the following main experiences.

## 1. Opportunity Dashboard

Display customer opportunities with useful information such as:

- customer
- opportunity name
- industry
- estimated value
- expected delivery duration
- status
- proposal progress
- last modified date

Allow the user to select an existing opportunity or create a new one.

---

## 2. Opportunity Intake

Provide a form where the user can enter information such as:

- customer name
- opportunity name
- business problem
- expected outcomes
- scope
- stakeholders
- constraints
- target timeline
- budget or effort assumptions
- additional notes

The UI should feel like a realistic Professional Services application rather than a developer prototype.

---

## 3. Document and Meeting Notes Intake

Allow the user to:

- upload meeting notes
- upload requirement documents
- choose existing synthetic meeting notes
- review uploaded files

Store uploaded documents in Azure Blob Storage.

---

## 4. AI Proposal Generation

The system should orchestrate several runtime AI agents.

### Requirements Analysis Agent

Extract:

- business goals
- business problems
- scope
- stakeholders
- constraints
- success criteria
- timelines
- open questions

### Content Retrieval Agent

Search the reusable content library and retrieve relevant:

- previous proposal content
- case studies
- delivery templates
- service descriptions
- methodologies

Use Azure AI Search with retrieval grounded in synthetic organizational content.

### Proposal Drafting Agent

Generate a complete proposal containing:

- Executive Summary
- Customer Challenges
- Proposed Solution
- Scope
- Deliverables
- Delivery Approach
- Milestones
- Assumptions
- Dependencies
- Risks
- Success Criteria
- Next Steps

The generated content should resemble realistic Professional Services / Statement of Work content.

### Risk Review Agent

Review the generated proposal and identify:

- assumptions
- delivery risks
- dependencies
- missing information
- ambiguous requirements
- open customer questions

Risk findings should be visible to the user rather than silently changing the proposal.

---

# 5. Proposal Workspace

Create a proposal workspace where each proposal section is displayed independently.

Users must be able to:

- review generated content
- edit sections manually
- regenerate an individual section
- approve individual sections
- see which sections are pending approval
- view supporting/retrieved content used during generation

Where practical, provide visible citations or source references to retrieved reusable content.

---

# 6. Human Review Workflow

The user must remain in control.

Support states such as:

Draft
Generated
In Review
Approved

Users should be able to approve or regenerate proposal sections before approving the complete proposal.

---

# 7. Reusable Content Library

Provide a separate area where users can browse reusable organizational content.

Include synthetic:

- previous proposal snippets
- case studies
- service descriptions
- delivery methodologies
- templates

Provide search/filter functionality.

This content should also form the knowledge base used by the Content Retrieval Agent.

---

# 8. Export

Allow an approved proposal to be exported as:

- Markdown
- PDF

The exported document should look professional enough to show during a customer demo.

---

# 9. Audit and History

Provide an audit/history page showing events such as:

- opportunity created
- documents uploaded
- proposal generated
- proposal section regenerated
- proposal section edited
- section approved
- proposal approved
- proposal exported

Include timestamps and relevant metadata.

---

# Synthetic demo data

Create realistic synthetic data so the application is useful immediately after deployment.

Create at minimum:

- 10 customer opportunities
- 20 previous proposal snippets
- 10 case studies
- 5 delivery methodology templates
- multiple meeting-note documents
- service descriptions
- sample pricing and effort assumptions

Use fictional companies and fictional people.

The data should cover several different Professional Services scenarios so retrieval results visibly change depending on the selected opportunity.

Examples can include:

- cloud modernization
- AI adoption
- data platform modernization
- application modernization
- customer service transformation

Seed this data automatically so I do not need to enter everything manually before a demo.

---

# Azure architecture

Use Azure-native services.

Preferred architecture:

- Azure Container Apps or Azure App Service for application hosting
- Azure Blob Storage for uploaded and reusable documents
- Azure AI Search for retrieval / RAG
- Azure OpenAI / Microsoft Foundry capabilities for the runtime AI functionality
- Cosmos DB for opportunities, proposal state, history, and metadata
- Azure Key Vault where secrets are actually required
- Managed Identity wherever possible
- Application Insights / Azure Monitor for observability

You may refine this architecture if there is a strong technical reason, but explain material architectural changes.

Prefer the simplest architecture that produces a robust customer demo.

Avoid unnecessary enterprise complexity.

---

# Infrastructure as Code

All Azure infrastructure must be reproducible.

Use Bicep for Azure resources.

Organize infrastructure cleanly, for example:

infra/
  main.bicep
  modules/
  parameters/

Where appropriate, use Azure Developer CLI (azd) to orchestrate environment deployment.

Do not rely exclusively on manually executed Azure CLI commands to define infrastructure.

Azure CLI may be used for authentication, validation, diagnostics, bootstrapping, and deployment operations.

---

# Security requirements

Do not hard-code:

- passwords
- API keys
- connection strings
- credentials

Prefer Managed Identity and RBAC.

Use Key Vault only when secrets are actually required.

Follow least-privilege principles while keeping the prototype practical.

Do not store credentials in Git.

---

# Application architecture

Choose an appropriate modern technology stack.

Prefer technologies that GitHub Copilot can easily understand and extend during a live demo.

Keep clear separation between:

- frontend
- backend/API
- AI orchestration
- data access
- infrastructure
- tests

The repository should be easy for another developer or Copilot session to understand.

Create useful documentation.

---

# UX requirements

The application should look like a customer-facing demonstration rather than an internal proof of concept.

Prioritize:

- clean navigation
- modern UI
- Professional Services look and feel
- responsive layout
- loading indicators
- progress visibility during AI generation
- useful empty states
- clear approval states
- error handling

Do not spend excessive time on visual perfection, but avoid a basic/raw developer interface.

---

# Demo flow

The main end-to-end demonstration should be:

1. Open AI Proposal Factory.
2. View the Opportunity Dashboard.
3. Select a customer opportunity.
4. Review the opportunity requirements.
5. Select or upload meeting notes.
6. Start proposal generation.
7. Show that AI is analysing requirements.
8. Show relevant content being retrieved from the organizational knowledge base.
9. Generate the proposal.
10. Review the generated sections.
11. Review risks and assumptions.
12. Regenerate or manually edit one section.
13. Approve proposal sections.
14. Approve the full proposal.
15. Export the proposal as PDF.
16. Open the audit trail and show the history of what happened.

This entire flow must work using the deployed Azure application.

---

# GitHub Copilot live-demo extensibility

This requirement is extremely important.

The final codebase must intentionally make it easy for me to demonstrate adding a new feature using GitHub Copilot during a live customer session.

Do NOT intentionally leave bugs or incomplete core functionality.

Instead, create a fully working product and maintain a documented backlog called:

DEMO-EXTENSIONS.md

Populate it with approximately 8-12 OPTIONAL enhancements that are valuable but not necessary for the core application.

Each enhancement should be achievable independently without redesigning the application.

Prefer demo enhancements that GitHub Copilot could realistically implement quickly.

Potential examples include:

- Add proposal quality scoring.
- Add a customer industry field and filter.
- Add dark mode.
- Add a new proposal section.
- Add a proposal comparison view.
- Add comments to proposal sections.
- Add an estimated project margin indicator.
- Add support for DOCX export.
- Add an executive dashboard.
- Add a new risk severity visualization.
- Add customer branding/logo to exported proposals.
- Add a "translate proposal" action.

Do not necessarily implement these examples now.

Choose the best extension opportunities based on the architecture you create.

For each extension in DEMO-EXTENSIONS.md include:

- business value
- expected files/components affected
- approximate complexity: Easy / Medium
- suggested prompt I could give GitHub Copilot during a live demo

At least 3 extensions should be deliberately designed to be very easy live-demo additions.

---

# GitHub and CI/CD

Create:

- appropriate .gitignore
- README.md
- architecture documentation
- setup instructions
- local development instructions
- deployment instructions
- GitHub Actions workflow

The GitHub Actions pipeline should perform appropriate:

- build
- linting
- tests
- infrastructure validation where practical

Do not create dependencies on unavailable external systems.

---

# Testing

Implement automated tests for important functionality.

At minimum validate:

- opportunity management
- proposal generation API
- proposal state transitions
- content retrieval integration boundaries
- proposal export
- core UI/application startup

Use mocks where appropriate for AI services during automated tests so tests are repeatable and do not unnecessarily consume Azure OpenAI capacity.

---

# Azure deployment

I want you to provision and deploy this application into my currently authenticated Azure development subscription.

Before creating Azure resources:

1. Inspect the active Azure tenant and subscription using Azure CLI.
2. Show me the tenant and subscription you detected.
3. Determine an appropriate Azure region based on required service availability.
4. Show me the proposed resource group and main Azure resources.
5. Avoid modifying or deleting unrelated existing resources.

Once the target environment is established, proceed with provisioning and deployment.

Use consistent resource naming and tags identifying this as the AI Proposal Factory demo.

---

# Deployment validation

Do not consider the task complete merely because the deployment command succeeds.

After deployment:

1. Verify all required Azure resources exist.
2. Verify Managed Identity and RBAC configuration.
3. Verify application configuration.
4. Verify Azure AI Search indexing.
5. Verify synthetic content has been seeded.
6. Verify Cosmos DB has the required data.
7. Verify the deployed application responds successfully.
8. Exercise the main application workflow.
9. Verify proposal generation.
10. Verify proposal persistence.
11. Verify export.
12. Inspect Application Insights / logs for obvious errors.

Fix deployment or application issues you encounter.

---

# Definition of Done

The project is complete when:

- the application is deployed in Azure
- I can open it through a browser
- synthetic opportunities already exist
- reusable content is already available
- I can select an opportunity
- I can provide meeting notes
- AI can analyse the requirements
- relevant reusable content is retrieved
- a complete proposal is generated
- individual proposal sections can be edited/regenerated/approved
- risks and assumptions are visible
- the complete proposal can be approved
- the proposal can be exported
- an audit trail is available
- Azure infrastructure is represented in Bicep
- the repository contains documentation
- automated tests pass
- the GitHub Actions workflow exists
- DEMO-EXTENSIONS.md contains useful future live-demo enhancements

Do not declare the project complete until the deployed end-to-end experience has been validated.

Start by analysing the project and casting the Squad team you believe is appropriate.

After casting the team, present:
1. the proposed team,
2. your proposed architecture,
3. major implementation phases,
4. important assumptions or questions.

Then begin implementation once the initial direction is established.