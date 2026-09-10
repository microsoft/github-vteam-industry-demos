from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate, Spacer

from app.backend.models import Opportunity, Proposal


def proposal_markdown(opportunity: Opportunity, proposal: Proposal) -> str:
    lines = [
        "# AI Proposal Factory",
        "",
        f"## {proposal.title}",
        "",
        f"**Customer:** {opportunity.customer}",
        f"**Status:** {proposal.status}",
        "",
    ]
    for section in sorted(proposal.sections, key=lambda item: item.order):
        lines.extend([f"## {section.title}", "", section.content, ""])
        if section.source_references:
            lines.extend(
                [
                    "_Sources: "
                    + "; ".join(section.source_references)
                    + "_",
                    "",
                ]
            )
    lines.extend(["## Risk review", ""])
    for risk in proposal.risks:
        lines.append(
            f"- **{risk.severity} — {risk.category}:** {risk.description} "
            f"Mitigation: {risk.mitigation}"
        )
    return "\n".join(lines)


def proposal_pdf(opportunity: Opportunity, proposal: Proposal) -> bytes:
    buffer = BytesIO()
    styles = getSampleStyleSheet()
    styles.add(
        ParagraphStyle(
            name="Brand",
            parent=styles["Title"],
            textColor=HexColor("#234c9f"),
            fontSize=12,
            leading=15,
            alignment=TA_CENTER,
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="ProposalTitle",
            parent=styles["Title"],
            textColor=HexColor("#172033"),
            fontSize=23,
            leading=29,
            alignment=TA_CENTER,
            spaceAfter=14,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Section",
            parent=styles["Heading2"],
            textColor=HexColor("#234c9f"),
            fontSize=14,
            leading=18,
            spaceBefore=10,
            spaceAfter=8,
        )
    )
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=22 * mm,
        leftMargin=22 * mm,
        topMargin=20 * mm,
        bottomMargin=20 * mm,
        title=proposal.title,
        author="AI Proposal Factory",
    )
    story = [
        Spacer(1, 25 * mm),
        Paragraph("AI PROPOSAL FACTORY", styles["Brand"]),
        Paragraph(escape(proposal.title), styles["ProposalTitle"]),
        Paragraph(f"Prepared for {escape(opportunity.customer)}", styles["Heading3"]),
        Spacer(1, 8 * mm),
        Paragraph(
            "A synthetic customer demonstration proposal produced with human review controls.",
            styles["BodyText"],
        ),
        PageBreak(),
    ]
    for section in sorted(proposal.sections, key=lambda item: item.order):
        story.extend(
            [
                Paragraph(escape(section.title), styles["Section"]),
                Paragraph(escape(section.content).replace("\n", "<br/>"), styles["BodyText"]),
            ]
        )
        if section.source_references:
            story.append(
                Paragraph(
                    "Sources: " + escape("; ".join(section.source_references)),
                    styles["Italic"],
                )
            )
    story.extend([PageBreak(), Paragraph("Risk review", styles["ProposalTitle"])])
    for finding in proposal.risks:
        story.append(
            Paragraph(
                f"<b>{escape(finding.severity)} — {escape(finding.category)}</b><br/>"
                f"{escape(finding.description)}<br/><i>Mitigation: {escape(finding.mitigation)}</i>",
                styles["BodyText"],
            )
        )
        story.append(Spacer(1, 4 * mm))
    doc.build(story)
    return buffer.getvalue()
