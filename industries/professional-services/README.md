# Professional Services

## Available Demo

### AI Proposal Factory

AI Proposal Factory helps professional services organizations create AI-assisted
proposals from customer requirements and reusable organizational knowledge.
It uses Microsoft Foundry and Azure AI Search and was built with GitHub Copilot CLI + Squad.

- **[Open the AI Proposal Factory project](./ai-proposal-factory/)**
- **[Open the live application](https://ca-professional-services-04.graysmoke-ab215499.swedencentral.azurecontainerapps.io/)**
- **[Watch the demo video](./media/ai-proposal-factory-demo.mp4)**
- **[GitHub Copilot CLI + Squad live demo changes](./ai-proposal-factory/LIVE-DEMO-QUICK-CHANGES.md)**

> The demo uses synthetic data. AI-generated content requires human review and approval.

## Business Challenge & Solution

Proposal teams often spend significant time gathering discovery notes, previous
proposals, service descriptions, and delivery assumptions from scattered sources.
This manual work can lead to inconsistent proposals and overlooked risks.
AI Proposal Factory brings customer requirements and relevant organizational
knowledge into one workflow to draft a consistent, grounded proposal.
Reviewers can refine the content, review risks, and approve the final proposal
before exporting it.

## Key Capabilities

- AI-assisted generation of 12-section proposals from opportunity details and selected discovery notes.
- Three Microsoft Foundry agents: Requirements Analyst, Proposal Writer, and Risk Reviewer.
- Reusable organizational knowledge through Azure AI Search, with visible grounding sources and a searchable Knowledge Library.
- Human review with section editing, regeneration, and approval; final approval requires all sections to be approved.
- Risk identification and review, including severity filters, mitigations, open questions, and acknowledgments.
- Markdown and PDF proposal exports, with source references and a PDF Risk Review appendix.

## Technology Stack

React and TypeScript provide the frontend, with a FastAPI backend hosted together
on Azure Container Apps.
Microsoft Foundry powers the three-agent workflow, Azure AI Search retrieves
reusable knowledge, and Azure Storage persists meeting notes, proposals, and
workflow records.
GitHub Copilot CLI and Squad supported development.

## Built with GitHub Copilot CLI + Squad

Squad is a way to organize AI-assisted development around a coordinator and
specialist agents, rather than asking one agent to handle every task.
In this project, the specialists covered architecture, full-stack engineering,
and Azure + AI engineering.
The solution was developed in three phases using natural-language prompts
and a shared build brief: Azure foundation, Foundry intelligence and the core
application, then human review and finalization.
Prompts such as "Implement Phase 1 from the brief" directed the team to the
documented requirements.
Each phase was validated before proceeding, with human decisions retained
at the phase boundaries.

## Project Resources

- **[Application README](./ai-proposal-factory/README.md)** - Original Phase 1 setup and deployment notes.
- **[Architecture documentation](./ai-proposal-factory/docs/architecture.md)** - Phase 1 Azure foundation.
- **[Squad build brief](./ai-proposal-factory/AI-PROPOSAL-FACTORY-SQUAD-BRIEF-V6-RG04.md)** - Requirements, constraints, and phased build guidance.
- **[Live-demo playbook](./ai-proposal-factory/LIVE-DEMO-QUICK-CHANGES.md)** - Small customer-facing changes using GitHub Copilot CLI + Squad.
- **[Implementation status](./ai-proposal-factory/STATUS.md)** - Completed workflow, deployed architecture, and validation evidence.
