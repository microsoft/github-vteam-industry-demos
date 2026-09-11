from app.backend.models.domain import (
    AnalystSummary,
    CompletenessFinding,
    Document,
    DocumentExtractionResult,
    ExtractionInterpretation,
    ExtractedFact,
    KycCase,
    RiskFinding,
    ScreeningRecord,
)
from app.backend.seed.generator import PRIMARY_CASE_ID


class DemoDocumentExtractionProvider:
    mode = "deterministic-demo"
    model_id = "seeded-document-facts"

    def extract(self, documents: list[Document]) -> list[ExtractedFact]:
        return [fact for document in documents for fact in document.extracted_facts]

    def extract_document(self, document: Document) -> DocumentExtractionResult:
        return DocumentExtractionResult(
            document_id=document.id,
            document_name=document.name,
            model_id=self.model_id,
            provider_mode=self.mode,
            content=document.preview,
            facts=document.extracted_facts,
        )


class DemoInvestigationReasoningProvider:
    mode = "deterministic-demo"

    def interpret_extraction(
        self, case: KycCase, facts: list[ExtractedFact]
    ) -> ExtractionInterpretation:
        return ExtractionInterpretation(facts=facts, warnings=[])

    def completeness(
        self, case: KycCase, facts: list[ExtractedFact]
    ) -> list[CompletenessFinding]:
        findings = [
            CompletenessFinding(
                requirement="Company registration",
                status="Complete",
                evidence="Certificate of Incorporation and Company Registration Extract",
                explanation="Legal name and registration number are supported by synthetic evidence.",
            ),
            CompletenessFinding(
                requirement="Registered address",
                status="Complete",
                evidence="Proof of Registered Address",
                explanation="A current synthetic address document is available.",
            ),
            CompletenessFinding(
                requirement="Director information",
                status="Complete",
                evidence="Company Registration Extract",
                explanation="Two fictional directors are recorded.",
            ),
            CompletenessFinding(
                requirement="Beneficial ownership",
                status="Needs Review" if case.id == PRIMARY_CASE_ID else "Complete",
                evidence="Beneficial Ownership Declaration",
                explanation=(
                    "One intermediate holding-company extract is not supplied."
                    if case.id == PRIMARY_CASE_ID
                    else "Declared beneficial owners account for the ownership structure."
                ),
            ),
            CompletenessFinding(
                requirement="Ownership percentages",
                status="Conflicting" if case.id == PRIMARY_CASE_ID else "Complete",
                evidence="Ownership Declaration / Corporate Structure Document",
                explanation=(
                    "Percentages reconcile, but one supporting ownership layer needs independent evidence."
                    if case.id == PRIMARY_CASE_ID
                    else "Declared percentages reconcile to 100%."
                ),
            ),
            CompletenessFinding(
                requirement="Onboarding declaration",
                status="Complete",
                evidence="Onboarding Form",
                explanation="The synthetic onboarding purpose and activity are recorded.",
            ),
        ]
        return findings

    def risks(
        self,
        case: KycCase,
        facts: list[ExtractedFact],
        screening_records: list[ScreeningRecord],
    ) -> list[RiskFinding]:
        findings = [
            RiskFinding(
                category="Ownership Complexity",
                severity="Medium" if case.id == PRIMARY_CASE_ID else case.risk_level,
                description="The applicant is owned through a fictional intermediate holding entity.",
                evidence="Corporate Structure Document and Beneficial Ownership Declaration",
                source="Deterministic demo investigation",
                confidence=0.91,
                recommended_action="Obtain evidence supporting the intermediate ownership layer.",
            )
        ]
        if case.id == PRIMARY_CASE_ID:
            match = next(record for record in screening_records if record.id == "SCR-007")
            findings.extend(
                [
                    RiskFinding(
                        category="Potential Name Similarity",
                        severity="Medium",
                        description=(
                            "The fictional beneficial owner Elin Marvik has a similar name "
                            f"to synthetic screening record {match.name}. This is not a confirmed match."
                        ),
                        evidence="Beneficial Ownership Declaration and SCR-007",
                        source="Local synthetic screening dataset",
                        confidence=0.64,
                        recommended_action="Manually verify identity attributes and document the disposition.",
                    ),
                    RiskFinding(
                        category="Address Difference",
                        severity="Low",
                        description="The trading and registered addresses differ across the case profile.",
                        evidence="Onboarding Form and Proof of Registered Address",
                        source="Deterministic demo investigation",
                        confidence=0.94,
                        recommended_action="Confirm the operational reason for the different addresses.",
                    ),
                ]
            )
        return findings

    def summary(
        self,
        case: KycCase,
        completeness: list[CompletenessFinding],
        risks: list[RiskFinding],
    ) -> AnalystSummary:
        needs_follow_up = any(
            finding.status in {"Missing", "Needs Review", "Conflicting"}
            for finding in completeness
        )
        action = "Request More Information" if needs_follow_up else "Approve"
        return AnalystSummary(
            customer_overview=(
                f"{case.company} is a fictional {case.onboarding_type.lower()} "
                f"applicant incorporated in {case.country}."
            ),
            ownership_summary=(
                "Two fictional beneficial owners hold the applicant indirectly through "
                "one intermediate holding entity."
            ),
            evidence_summary=(
                f"{len(case.documents)} synthetic onboarding documents were reviewed. "
                "Most required evidence is available."
            ),
            risk_summary=(
                f"{len(risks)} analyst-support signals were identified. "
                "No prohibited party or compliance conclusion is confirmed."
            ),
            open_questions=[
                "Can the customer provide evidence for the intermediate ownership layer?",
                "Can identity attributes resolve the synthetic name similarity?",
            ]
            if needs_follow_up
            else ["Confirm the analyst is satisfied with the supplied evidence."],
            recommended_action=action,
            rationale=(
                "Additional evidence is required to validate one ownership layer and "
                "the potential synthetic screening similarity requires manual verification."
                if needs_follow_up
                else "The supplied synthetic evidence is complete and no material demo risks remain."
            ),
            provider_mode="deterministic-demo",
        )
