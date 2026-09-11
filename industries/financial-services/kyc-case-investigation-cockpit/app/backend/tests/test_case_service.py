import pytest

from app.backend.models.domain import DecisionRequest
from app.backend.seed.generator import PRIMARY_CASE_ID
from app.backend.services.cases import CaseService
from app.backend.storage.memory import MemoryDemoState


def test_case_service_lists_and_filters_cases() -> None:
    service = CaseService(MemoryDemoState())

    assert len(service.list_cases()) == 25
    assert [case.id for case in service.list_cases(search="Northstar")] == [
        PRIMARY_CASE_ID
    ]
    assert all(case.risk_level == "High" for case in service.list_cases(risk="High"))
    assert all(
        case.status == "Approved" for case in service.list_cases(status="Approved")
    )


@pytest.mark.parametrize(
    ("action", "expected_status"),
    [
        ("Approve", "Approved"),
        ("Request More Information", "Awaiting Information"),
        ("Escalate", "Escalated"),
    ],
)
def test_human_decision_changes_status_and_creates_audit(
    action: str, expected_status: str
) -> None:
    state = MemoryDemoState()
    service = CaseService(state)
    before = service.get_case(PRIMARY_CASE_ID)
    assert before is not None

    updated = service.decide(
        PRIMARY_CASE_ID,
        DecisionRequest(action=action, reason="Analyst verified the demo evidence."),
    )

    assert updated is not None
    assert updated.status == expected_status
    assert updated.decisions[-1].action == action
    assert updated.audit[-1].actor_type == "Human Analyst"
    assert updated.audit[-1].detail == "Analyst verified the demo evidence."
    assert len(updated.audit) == len(before.audit) + 1


def test_decision_requires_non_whitespace_reason() -> None:
    service = CaseService(MemoryDemoState())

    with pytest.raises(ValueError, match="reason is required"):
        service.decide(
            PRIMARY_CASE_ID,
            DecisionRequest(action="Approve", reason="   "),
        )
