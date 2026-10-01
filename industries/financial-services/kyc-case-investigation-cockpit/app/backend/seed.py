from copy import deepcopy
from datetime import date, timedelta

PRIMARY_CASE_ID = "KYC-2026-001"
PRIMARY_COMPANY = "Northstar Meridian AB"

COMPANIES = [
    ("Northstar Meridian AB", "Sweden", "Medium", "Investigating", "Ownership Complexity"),
    ("Amber Quay Logistics Oy", "Finland", "Low", "New", "Straightforward"),
    ("Bluepine Robotics AB", "Sweden", "Low", "Ready for Decision", "Straightforward"),
    ("Cedar Atlas Consulting ApS", "Denmark", "Medium", "Awaiting Information", "Missing Evidence"),
    ("Driftwood Energy Services Ltd", "Ireland", "High", "Escalated", "Multiple Concerns"),
    ("Eiderholm Design AB", "Sweden", "Low", "Approved", "Historical Approval"),
    ("Fjordline Components AS", "Norway", "Medium", "Investigating", "Ownership Complexity"),
    ("Granite Vale Foods Oy", "Finland", "Low", "New", "Straightforward"),
    ("Harbor Kite Analytics AB", "Sweden", "Medium", "Ready for Decision", "Potential Similarity"),
    ("Ironleaf Circularity ApS", "Denmark", "High", "Investigating", "Multiple Concerns"),
    ("Juniper Crown Media AB", "Sweden", "Low", "Approved", "Historical Approval"),
    ("Kestrel Bridge Systems Ltd", "Ireland", "Medium", "Awaiting Information", "Missing Evidence"),
    ("Lumen Orchard Health AB", "Sweden", "Low", "New", "Straightforward"),
    ("Mistral Forge Manufacturing Oy", "Finland", "Medium", "Investigating", "Ownership Complexity"),
    ("Noble Tern Shipping AS", "Norway", "High", "Escalated", "Multiple Concerns"),
    ("Oaklight Learning AB", "Sweden", "Low", "Ready for Decision", "Straightforward"),
    ("Pinehaven Textiles ApS", "Denmark", "Medium", "Awaiting Information", "Missing Evidence"),
    ("Quartz Meadow Software AB", "Sweden", "Medium", "Investigating", "Potential Similarity"),
    ("Riverglass Mobility Oy", "Finland", "Low", "Approved", "Historical Approval"),
    ("Silver Elm Construction AB", "Sweden", "High", "Investigating", "Multiple Concerns"),
    ("Tundra Bloom Biotech AS", "Norway", "Medium", "Ready for Decision", "Ownership Complexity"),
    ("Umber Coast Trading Ltd", "Ireland", "Medium", "Awaiting Information", "Missing Evidence"),
    ("Verdant Loom Interiors AB", "Sweden", "Low", "New", "Straightforward"),
    ("Willow Arc Renewables ApS", "Denmark", "Medium", "Investigating", "Potential Similarity"),
    ("Yarrow Peak Engineering AB", "Sweden", "Low", "Approved", "Historical Approval"),
]

COUNTRY_CODES = {"Sweden": "SE", "Finland": "FI", "Denmark": "DK", "Norway": "NO", "Ireland": "IE"}


def _primary_case() -> dict:
    documents = [
        ("DOC-001", "Certificate of Registration", "registration-certificate.pdf", "not_processed"),
        ("DOC-002", "Proof of Registered Address", "registered-address.pdf", "not_processed"),
        ("DOC-003", "Beneficial Ownership Declaration", "beneficial-ownership.pdf", "not_processed"),
        ("DOC-004", "Director Register", "director-register.pdf", "not_processed"),
        ("DOC-005", "Corporate Structure", "corporate-structure.pdf", "not_processed"),
        ("DOC-006", "Onboarding Form", "onboarding-form.pdf", "not_processed"),
    ]
    return {
        "id": PRIMARY_CASE_ID,
        "company": PRIMARY_COMPANY,
        "country": "Sweden",
        "onboarding_type": "Business Account",
        "submitted_date": "2026-09-18",
        "status": "Investigating",
        "risk_level": "Medium",
        "completeness": 83,
        "assigned_analyst": "Elin Berg (fictional)",
        "last_modified": "2026-09-30",
        "scenario": "Ownership Complexity",
        "profile": {
            "legal_name": PRIMARY_COMPANY,
            "registration_number": "559999-4107",
            "incorporation_country": "Sweden",
            "incorporation_date": "2019-04-12",
            "registered_address": "14 Aurora Quay, 111 52 Stockholm, Sweden",
            "trading_address": "8 Meridian Park, 169 70 Solna, Sweden",
            "business_activity": "Maritime route optimisation software",
            "directors": ["Elara Voss", "Mikael Strand", "Nora Lind"],
        },
        "ownership": [
            {
                "entity": "Meridian Holdings AB",
                "relationship": "Direct shareholder",
                "ownership_percentage": 60,
                "jurisdiction": "Sweden",
                "source_document": "Beneficial Ownership Declaration",
            },
            {
                "entity": "Elara Voss",
                "relationship": "Beneficial owner via Meridian Holdings AB",
                "ownership_percentage": 36,
                "jurisdiction": "Sweden",
                "source_document": "Corporate Structure",
            },
            {
                "entity": "Lumen Fjord Ventures Oy",
                "relationship": "Direct shareholder",
                "ownership_percentage": 40,
                "jurisdiction": "Finland",
                "source_document": "Beneficial Ownership Declaration",
            },
            {
                "entity": "Soren Vale",
                "relationship": "Beneficial owner via Lumen Fjord Ventures Oy",
                "ownership_percentage": 28,
                "jurisdiction": "Finland",
                "source_document": "Corporate Structure",
            },
        ],
        "completeness_items": [
            {"requirement": "Company registration", "status": "Complete", "evidence": "Certificate of Registration"},
            {"requirement": "Registered address", "status": "Complete", "evidence": "Proof of Registered Address"},
            {"requirement": "Directors", "status": "Complete", "evidence": "Director Register"},
            {"requirement": "Beneficial owners", "status": "Needs Review", "evidence": "Ownership Declaration"},
            {"requirement": "Ownership percentages", "status": "Conflicting", "evidence": "Structure chart does not evidence one intermediate layer"},
            {"requirement": "Onboarding declaration", "status": "Complete", "evidence": "Onboarding Form"},
        ],
        "documents": [
            {
                "id": doc_id,
                "type": doc_type,
                "file_name": file_name,
                "processing_status": status,
                "confidence": None,
                "blob_name": f"documents/{PRIMARY_CASE_ID}/{file_name}",
                "extraction": None,
                "error": None,
            }
            for doc_id, doc_type, file_name, status in documents
        ],
    }


def build_seed_state() -> dict:
    primary = _primary_case()
    cases = [primary]
    base_date = date(2026, 9, 29)
    for index, (company, country, risk, status, scenario) in enumerate(COMPANIES[1:], start=2):
        case_id = f"KYC-2026-{index:03d}"
        completion = 96 if risk == "Low" else 72 if risk == "Medium" else 54
        cases.append(
            {
                "id": case_id,
                "company": company,
                "country": country,
                "onboarding_type": "Business Account",
                "submitted_date": str(base_date - timedelta(days=index)),
                "status": status,
                "risk_level": risk,
                "completeness": completion,
                "assigned_analyst": ["Elin Berg", "Noah Ek", "Aila Holm"][index % 3] + " (fictional)",
                "last_modified": str(base_date - timedelta(days=index % 5)),
                "scenario": scenario,
                "profile": {
                    "legal_name": company,
                    "registration_number": f"{COUNTRY_CODES[country]}-{860000 + index:06d}",
                    "incorporation_country": country,
                    "incorporation_date": f"20{10 + index % 12:02d}-{1 + index % 9:02d}-14",
                    "registered_address": f"{10 + index} Fictional Harbour Road, Demo City, {country}",
                    "trading_address": f"{20 + index} Sample Park, Demo City, {country}",
                    "business_activity": ["Technology", "Professional services", "Manufacturing"][index % 3],
                    "directors": [f"Fictional Director {index}A", f"Fictional Director {index}B"],
                },
                "ownership": [
                    {
                        "entity": f"Fictional Owner {index}",
                        "relationship": "Direct beneficial owner",
                        "ownership_percentage": 60,
                        "jurisdiction": country,
                        "source_document": "Onboarding Form",
                    },
                    {
                        "entity": f"Demo Ventures {index} AB",
                        "relationship": "Corporate shareholder",
                        "ownership_percentage": 40,
                        "jurisdiction": "Sweden",
                        "source_document": "Onboarding Form",
                    },
                ],
                "completeness_items": [
                    {"requirement": "Company registration", "status": "Complete", "evidence": "Onboarding dossier"},
                    {
                        "requirement": "Beneficial owners",
                        "status": "Complete" if risk == "Low" else "Needs Review",
                        "evidence": "Onboarding dossier",
                    },
                    {
                        "requirement": "Registered address",
                        "status": "Missing" if scenario == "Missing Evidence" else "Complete",
                        "evidence": "Onboarding dossier",
                    },
                ],
                "documents": [
                    {
                        "id": f"DOC-{index:03d}",
                        "type": "Onboarding Dossier",
                        "file_name": "onboarding-dossier.pdf",
                        "processing_status": "not_processed",
                        "confidence": None,
                        "blob_name": f"documents/{case_id}/onboarding-dossier.pdf",
                        "extraction": None,
                        "error": None,
                    }
                ],
            }
        )
    return {"schema_version": 1, "seed_version": "phase2-v1", "cases": deepcopy(cases)}


def document_text(case: dict, document: dict) -> str:
    profile = case["profile"]
    lines = [
        "SYNTHETIC DEMONSTRATION DOCUMENT - NO REAL PERSONAL DATA",
        f"Document Type: {document['type']}",
        f"Case ID: {case['id']}",
        f"Legal Name: {profile['legal_name']}",
        f"Registration Number: {profile['registration_number']}",
        f"Incorporation Country: {profile['incorporation_country']}",
        f"Registered Address: {profile['registered_address']}",
        f"Document Date: {case['submitted_date']}",
    ]
    if case["id"] == PRIMARY_CASE_ID:
        lines.extend(
            [
                "Directors: Elara Voss; Mikael Strand; Nora Lind",
                "Beneficial Owners: Elara Voss 36%; Soren Vale 28%",
                "Ownership Note: Supporting evidence for Lumen Fjord Ventures Oy intermediate layer is pending.",
                "Declaration: Information is fictional and prepared only for the KYC cockpit demonstration.",
            ]
        )
    return "\n".join(lines)
