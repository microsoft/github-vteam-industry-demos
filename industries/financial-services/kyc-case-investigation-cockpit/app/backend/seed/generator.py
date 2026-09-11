from copy import deepcopy
from datetime import date, timedelta

from app.backend.models.domain import (
    AuditEvent,
    CompanyProfile,
    Document,
    ExtractedFact,
    KycCase,
    OwnershipRelationship,
    Person,
    ScreeningRecord,
)

PRIMARY_CASE_ID = "KYC-DEMO-001"
SEED_VERSION = "2026-09-10-v1"

COMPANY_NAMES = [
    "Northstar Components AB",
    "Bluehaven Trade Oy",
    "Lumen Ridge Holdings ApS",
    "Silver Pine Logistics AB",
    "Aurora Field Systems Oy",
    "Clearwater Packaging ApS",
    "Cobalt Bridge Analytics AB",
    "Ember Coast Textiles Oy",
    "Frostline Marine ApS",
    "Granite Bloom Foods AB",
    "Harborlight Engineering Oy",
    "Ivory Peak Consulting ApS",
    "Juniper Vale Energy AB",
    "Kindred Stone Imports Oy",
    "Lakewind Medical Supplies ApS",
    "Meadow Arc Technologies AB",
    "Nordic Cedar Furnishings Oy",
    "Opal Current Ventures ApS",
    "Pinecrest Mobility AB",
    "Quartz Harbor Services Oy",
    "Riverglass Manufacturing ApS",
    "Solstice Orchard Exports AB",
    "Tundra Beacon Software Oy",
    "Umber Sky Retail ApS",
    "Verdant Echo Materials AB",
]

PERSON_NAMES = [
    "Elin Marvik",
    "Jonas Elden",
    "Mara Voss",
    "Oskar Noren",
    "Linnea Sande",
    "Tobias Renn",
    "Aila Kest",
    "Henrik Vale",
    "Sofia Arden",
    "Mikkel Roan",
    "Freja Linde",
    "Nils Corven",
]

SCENARIOS = [
    "Straightforward onboarding",
    "Ownership complexity",
    "Missing evidence",
    "Potential screening similarity",
    "Address inconsistency",
    "Historical approval",
    "Awaiting customer evidence",
    "Previous analyst escalation",
]


def _documents(company: str, index: int) -> list[Document]:
    registration_number = f"SC-{420000 + index:06d}"
    address = f"{12 + index} Aurora Quay, Stockholm"
    facts = [
        ExtractedFact(
            field="Legal company name",
            value=company,
            source_document="Certificate of Incorporation",
            confidence=0.99,
        ),
        ExtractedFact(
            field="Registration number",
            value=registration_number,
            source_document="Company Registration Extract",
            confidence=0.98,
        ),
        ExtractedFact(
            field="Registered address",
            value=address,
            source_document="Proof of Registered Address",
            confidence=0.96,
        ),
    ]
    return [
        Document(
            id=f"DOC-{index:03d}-01",
            name="certificate-of-incorporation.txt",
            document_type="Certificate of Incorporation",
            submitted_at="2026-09-08",
            confidence=0.99,
            preview=(
                f"SYNTHETIC DOCUMENT\nCertificate of Incorporation\n\n"
                f"Legal name: {company}\nRegistration number: {registration_number}\n"
                "Issuing authority: Fictional Nordic Companies Office\n"
                "This document is generated solely for demonstration."
            ),
            extracted_facts=facts[:2],
        ),
        Document(
            id=f"DOC-{index:03d}-02",
            name="registered-address-evidence.txt",
            document_type="Proof of Registered Address",
            submitted_at="2026-09-08",
            confidence=0.96,
            preview=(
                "SYNTHETIC DOCUMENT\nRegistered Address Confirmation\n\n"
                f"Organisation: {company}\nAddress: {address}\n"
                "Document date: 2026-08-21\nNo real person or organisation is represented."
            ),
            extracted_facts=[facts[2]],
        ),
        Document(
            id=f"DOC-{index:03d}-03",
            name="beneficial-ownership-declaration.txt",
            document_type="Beneficial Ownership Declaration",
            submitted_at="2026-09-08",
            confidence=0.91,
            preview=(
                "SYNTHETIC DOCUMENT\nBeneficial Ownership Declaration\n\n"
                f"{PERSON_NAMES[(index - 1) % len(PERSON_NAMES)]}: 58% indirect interest\n"
                f"{PERSON_NAMES[index % len(PERSON_NAMES)]}: 42% indirect interest\n"
                "One intermediate holding-company extract remains subject to review."
            ),
        ),
        Document(
            id=f"DOC-{index:03d}-04",
            name="onboarding-form.txt",
            document_type="Onboarding Form",
            submitted_at="2026-09-09",
            confidence=0.97,
            preview=(
                f"SYNTHETIC ONBOARDING FORM\nApplicant: {company}\n"
                "Purpose: Business banking relationship demonstration\n"
                "Expected activity: Domestic and Nordic-region supplier payments."
            ),
        ),
        Document(
            id=f"DOC-{index:03d}-05",
            name="corporate-structure.txt",
            document_type="Corporate Structure Document",
            submitted_at="2026-09-09",
            confidence=0.89,
            preview=(
                f"SYNTHETIC CORPORATE STRUCTURE\n{company}\n"
                "Controlled through a fictional intermediate holding entity.\n"
                "Ownership totals reconcile to 100%; supporting evidence for one layer is pending."
            ),
        ),
    ]


def _ownership(company: str, index: int) -> list[OwnershipRelationship]:
    holding = f"{company.split()[0]} Meridian Holdings"
    return [
        OwnershipRelationship(
            owner=PERSON_NAMES[(index - 1) % len(PERSON_NAMES)],
            owned_entity=holding,
            percentage=58,
            relationship="Indirect beneficial owner",
            jurisdiction="Sweden",
            source_document="Beneficial Ownership Declaration",
        ),
        OwnershipRelationship(
            owner=PERSON_NAMES[index % len(PERSON_NAMES)],
            owned_entity=holding,
            percentage=42,
            relationship="Indirect beneficial owner",
            jurisdiction="Finland",
            source_document="Beneficial Ownership Declaration",
        ),
        OwnershipRelationship(
            owner=holding,
            owned_entity=company,
            percentage=100,
            relationship="Corporate shareholder",
            jurisdiction="Sweden",
            source_document="Corporate Structure Document",
        ),
    ]


def build_cases() -> list[KycCase]:
    cases: list[KycCase] = []
    countries = ["Sweden", "Finland", "Denmark", "Norway"]
    statuses = [
        "New",
        "Investigating",
        "Awaiting Information",
        "Ready for Decision",
        "Approved",
        "Escalated",
    ]
    risks = ["Low", "Medium", "Medium", "High"]
    base_date = date(2026, 9, 9)

    for index, company in enumerate(COMPANY_NAMES, start=1):
        case_id = PRIMARY_CASE_ID if index == 1 else f"KYC-DEMO-{index:03d}"
        country = countries[(index - 1) % len(countries)]
        scenario = "Ownership complexity and potential screening similarity" if index == 1 else SCENARIOS[(index - 1) % len(SCENARIOS)]
        status = "Investigating" if index == 1 else statuses[(index - 1) % len(statuses)]
        risk = "Medium" if index == 1 else risks[(index - 1) % len(risks)]
        documents = _documents(company, index)
        submitted = base_date - timedelta(days=index - 1)
        profile = CompanyProfile(
            legal_name=company,
            registration_number=f"SC-{420000 + index:06d}",
            incorporation_country=country,
            incorporation_date=f"{2012 + index % 10}-0{1 + index % 8}-15",
            registered_address=f"{12 + index} Aurora Quay, Stockholm",
            trading_address=(
                "88 Lantern Wharf, Gothenburg"
                if index == 1
                else f"{12 + index} Aurora Quay, Stockholm"
            ),
            directors=[
                Person(
                    name=PERSON_NAMES[(index + 2) % len(PERSON_NAMES)],
                    role="Director",
                    country=country,
                ),
                Person(
                    name=PERSON_NAMES[(index + 3) % len(PERSON_NAMES)],
                    role="Director",
                    country="Sweden",
                ),
            ],
        )
        cases.append(
            KycCase(
                id=case_id,
                company=company,
                country=country,
                onboarding_type="Business customer",
                submitted_date=submitted.isoformat(),
                status=status,
                risk_level=risk,
                completeness_percent=82 if index == 1 else 60 + (index * 7) % 40,
                assigned_analyst=["Alex Rivera", "Mira Chen", "Sam Okafor"][index % 3],
                last_modified=f"2026-09-{10 - min(index // 8, 2):02d}T{8 + index % 10:02d}:20:00+01:00",
                scenario=scenario,
                profile=profile,
                documents=documents,
                ownership=_ownership(company, index),
                audit=[
                    AuditEvent(
                        id=f"AUD-{index:03d}-01",
                        timestamp=f"{submitted.isoformat()}T09:00:00+01:00",
                        actor_type="System",
                        actor="Demo seeder",
                        action="Case created",
                        detail="Synthetic onboarding case created from deterministic seed data.",
                    ),
                    AuditEvent(
                        id=f"AUD-{index:03d}-02",
                        timestamp=f"{submitted.isoformat()}T09:05:00+01:00",
                        actor_type="System",
                        actor="Demo seeder",
                        action="Documents received",
                        detail=f"{len(documents)} synthetic documents attached to the case.",
                    ),
                ],
            )
        )
    return cases


def build_screening_records() -> list[ScreeningRecord]:
    countries = ["Fictionland", "Sweden", "Finland", "Denmark", "Norway"]
    categories = ["Synthetic watchlist", "Synthetic PEP-style", "Internal demo risk"]
    records = []
    for index in range(1, 41):
        name = f"{PERSON_NAMES[index % len(PERSON_NAMES)]} Demo {index:02d}"
        if index == 7:
            name = "Elina Marvik"
        records.append(
            ScreeningRecord(
                id=f"SCR-{index:03d}",
                name=name,
                aliases=[f"Fictional Alias {index:02d}"],
                country=countries[index % len(countries)],
                entity_type="Person" if index % 4 else "Organisation",
                category=categories[index % len(categories)],
                synthetic_risk_description=(
                    "Synthetic fictional record for name-similarity demonstration only; "
                    "not a real sanctions, PEP, or adverse-media record."
                ),
            )
        )
    return records


def build_seed_payload() -> dict:
    return {
        "seed_version": SEED_VERSION,
        "primary_case_id": PRIMARY_CASE_ID,
        "cases": [case.model_dump(mode="json") for case in build_cases()],
        "screening_records": [
            record.model_dump(mode="json") for record in build_screening_records()
        ],
    }


def fresh_seed() -> tuple[list[KycCase], list[ScreeningRecord]]:
    return deepcopy(build_cases()), deepcopy(build_screening_records())
