from app.backend.seed.generator import (
    PRIMARY_CASE_ID,
    build_cases,
    build_screening_records,
)


def test_seed_has_expected_stable_counts_and_primary_case() -> None:
    cases = build_cases()
    screening = build_screening_records()

    assert len(cases) == 25
    assert len(screening) == 40
    assert cases[0].id == PRIMARY_CASE_ID
    assert cases[0].company == "Northstar Components AB"
    assert cases[0].risk_level == "Medium"
    assert all("synthetic" in record.synthetic_risk_description.lower() for record in screening)


def test_seed_is_deterministic() -> None:
    first = [case.model_dump() for case in build_cases()]
    second = [case.model_dump() for case in build_cases()]

    assert first == second
