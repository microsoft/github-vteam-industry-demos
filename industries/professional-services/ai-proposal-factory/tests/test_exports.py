from pypdf import PdfReader

from app.backend.container import Services
from app.backend.services.exports import proposal_markdown, proposal_pdf


def test_markdown_and_pdf_exports(services: Services) -> None:
    opportunity = services.opportunities.get("opp-contoso-mobility")
    assert opportunity is not None
    job = services.proposals.start(opportunity.id)
    services.proposals.run(job.id)
    completed = services.proposals.get_job(job.id)
    assert completed and completed.proposal_id
    proposal = services.proposals.get(completed.proposal_id)
    assert proposal is not None

    markdown = proposal_markdown(opportunity, proposal)
    pdf = proposal_pdf(opportunity, proposal)

    assert "# AI Proposal Factory" in markdown
    assert "## Executive Summary" in markdown
    assert "Risk review" in markdown
    assert pdf.startswith(b"%PDF")
    assert len(PdfReader(__import__("io").BytesIO(pdf)).pages) >= 2
