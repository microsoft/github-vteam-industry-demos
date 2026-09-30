from __future__ import annotations

import re
from datetime import UTC, datetime
from io import BytesIO

from fpdf import FPDF

from .models import KnowledgeItem, Proposal


def export_filename(proposal: Proposal, extension: str) -> str:
    stem = re.sub(
        r"[^a-z0-9]+",
        "-",
        f"{proposal.customer}-{proposal.opportunityName}".lower(),
    ).strip("-")
    return f"{stem or proposal.id}.{extension}"


def markdown_export(proposal: Proposal, sources: dict[str, KnowledgeItem]) -> bytes:
    export_date = datetime.now(UTC).date().isoformat()
    lines = [
        f"# {proposal.opportunityName}",
        "",
        f"**Customer:** {proposal.customer}  ",
        f"**Status:** {proposal.status}  ",
        f"**Exported:** {export_date}",
        "",
    ]
    for section in sorted(proposal.sections, key=lambda item: item.order):
        lines.extend([f"## {section.order}. {section.title}", "", section.content, ""])
        resolved = [sources[item_id] for item_id in section.sourceIds if item_id in sources]
        if resolved:
            lines.extend(["### Sources", ""])
            lines.extend(
                f"- **{item.title}** ({item.kind}, {item.industry}) — `{item.sourceBlobName}`"
                for item in resolved
            )
            lines.append("")
    if proposal.riskFindings:
        lines.extend(["# Risk Review Appendix", ""])
        for finding in proposal.riskFindings:
            lines.extend(
                [
                    f"## {finding.severity}: {finding.category}",
                    "",
                    finding.description,
                    "",
                    f"**Mitigation / question:** {finding.mitigationOrQuestion}",
                    "",
                    f"**Status:** {finding.status}",
                    "",
                ]
            )
    return ("\n".join(lines).rstrip() + "\n").encode("utf-8")


class ProposalPdf(FPDF):
    def header(self) -> None:
        if self.page_no() > 1:
            self.set_font("Helvetica", "B", 9)
            self.set_text_color(10, 91, 104)
            self.cell(0, 7, "AI Proposal Factory", border=0)
            self.ln(10)

    def footer(self) -> None:
        self.set_y(-13)
        self.set_font("Helvetica", "", 8)
        self.set_text_color(105, 118, 135)
        self.cell(0, 8, f"AI Proposal Factory  |  Page {self.page_no()}", align="C")


def pdf_export(proposal: Proposal, sources: dict[str, KnowledgeItem]) -> bytes:
    pdf = ProposalPdf(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(18, 18, 18)
    pdf.add_page()
    pdf.set_fill_color(7, 27, 53)
    pdf.rect(0, 0, 210, 72, style="F")
    pdf.set_xy(18, 18)
    pdf.set_text_color(105, 234, 217)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, "AI PROPOSAL FACTORY")
    pdf.set_xy(18, 31)
    pdf.set_text_color(255, 255, 255)
    pdf.set_font("Helvetica", "B", 24)
    pdf.multi_cell(174, 10, _pdf_text(proposal.opportunityName))
    pdf.set_x(18)
    pdf.set_text_color(222, 232, 241)
    pdf.set_font("Helvetica", "", 11)
    pdf.cell(0, 8, _pdf_text(f"Prepared for {proposal.customer}"))
    pdf.set_y(82)
    _metadata_row(pdf, "Status", proposal.status)
    _metadata_row(pdf, "Export date", datetime.now(UTC).date().isoformat())
    _metadata_row(pdf, "Proposal ID", proposal.id)
    pdf.ln(5)

    for section in sorted(proposal.sections, key=lambda item: item.order):
        pdf.set_text_color(15, 118, 128)
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(0, 6, f"{section.order:02d}")
        pdf.ln()
        pdf.set_text_color(23, 36, 58)
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(0, 8, _pdf_text(section.title))
        pdf.set_text_color(67, 82, 101)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_x(pdf.l_margin)
        pdf.multi_cell(0, 6, _pdf_text(section.content))
        resolved = [sources[item_id] for item_id in section.sourceIds if item_id in sources]
        if resolved:
            pdf.ln(2)
            pdf.set_text_color(90, 105, 122)
            pdf.set_font("Helvetica", "I", 8)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(
                0,
                5,
                _pdf_text(
                    "Sources: "
                    + "; ".join(
                        f"{item.title} ({item.sourceBlobName})" for item in resolved
                    )
                ),
            )
        pdf.ln(6)

    if proposal.riskFindings:
        pdf.add_page()
        pdf.set_text_color(23, 36, 58)
        pdf.set_font("Helvetica", "B", 20)
        pdf.cell(0, 10, "Risk Review Appendix")
        pdf.ln(14)
        for finding in proposal.riskFindings:
            pdf.set_font("Helvetica", "B", 11)
            pdf.set_text_color(142, 72, 20)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 6, _pdf_text(f"{finding.severity} | {finding.category}"))
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(67, 82, 101)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(0, 5, _pdf_text(finding.description))
            pdf.set_font("Helvetica", "I", 9)
            pdf.set_x(pdf.l_margin)
            pdf.multi_cell(
                0, 5, _pdf_text(f"Mitigation / question: {finding.mitigationOrQuestion}")
            )
            pdf.ln(5)

    stream = BytesIO()
    pdf.output(stream)
    return stream.getvalue()


def _metadata_row(pdf: FPDF, label: str, value: str) -> None:
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(90, 105, 122)
    pdf.cell(32, 6, label)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(23, 36, 58)
    pdf.cell(0, 6, _pdf_text(value))
    pdf.ln()


def _pdf_text(value: str) -> str:
    substitutions = {
        "\u2013": "-",
        "\u2014": "-",
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2022": "-",
    }
    for source, replacement in substitutions.items():
        value = value.replace(source, replacement)
    return value.encode("latin-1", "replace").decode("latin-1")
