from jsonschema import Draft202012Validator

from scripts.phase3_contract import (
    AGENTS,
    SOURCE_LABEL,
    completeness_output_fixture,
    document_output_schema,
    profile_fixture,
    risk_output_fixture,
    screening_records,
)


def test_four_canonical_agents_have_strict_valid_schemas():
    assert [agent["name"] for agent in AGENTS] == [
        "kyc-document-entity-extractor",
        "kyc-completeness-validator",
        "kyc-risk-investigator",
        "kyc-analyst-summary",
    ]
    for agent in AGENTS:
        Draft202012Validator.check_schema(agent["schema"])
        assert agent["schema"]["additionalProperties"] is False
        assert agent["schema"]["properties"]["schema_version"]["const"] == "1.0"


def test_focused_outputs_match_contracts():
    Draft202012Validator(document_output_schema).validate(profile_fixture())
    Draft202012Validator(AGENTS[1]["schema"]).validate(completeness_output_fixture())
    Draft202012Validator(AGENTS[2]["schema"]).validate(risk_output_fixture())


def test_search_seed_is_deterministic_synthetic_and_balanced():
    records = screening_records()
    assert len(records) == 40
    assert len({record["record_id"] for record in records}) == 40
    assert {record["record_type"] for record in records} == {
        "watchlist_style",
        "pep_style",
        "internal_risk",
        "policy_reference",
    }
    assert all(record["synthetic"] is True for record in records)
    assert all(record["source_label"] == SOURCE_LABEL for record in records)
    assert next(record for record in records if record["record_id"] == "SYN-WATCH-001")[
        "display_name"
    ] == "Elara Vos"
