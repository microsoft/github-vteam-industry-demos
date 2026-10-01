from __future__ import annotations

import logging
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from jsonschema import Draft202012Validator

from scripts.phase3_contract import AGENTS

from .ai import AgentGateway, ScreeningGateway
from .config import Settings
from .service import CaseService
from .storage import StateStore

logger = logging.getLogger("kyc-cockpit.investigation")

POTENTIAL_MATCH_DISCLAIMER = (
    "Potential synthetic screening similarity — not a confirmed match. "
    "Analyst verification is required."
)

STAGES = [
    ("reading_documents", "Reading submitted documents"),
    ("extracting_profile", "Extracting company and ownership information"),
    ("checking_completeness", "Checking required evidence"),
    ("retrieving_screening", "Retrieving synthetic screening references"),
    ("investigating_risk", "Investigating potential risk indicators"),
    ("preparing_summary", "Preparing analyst summary"),
    ("saving_results", "Saving investigation"),
]

REQUIREMENTS = [
    {
        "requirement_id": "REQ-REG",
        "label": "Company registration evidence",
        "description": "A current synthetic company registration extract is required.",
        "required": True,
    },
    {
        "requirement_id": "REQ-ADDRESS",
        "label": "Registered address evidence",
        "description": "Registered address evidence must support the supplied address.",
        "required": True,
    },
    {
        "requirement_id": "REQ-DIRECTORS",
        "label": "Director evidence",
        "description": "Directors must be supported by submitted evidence.",
        "required": True,
    },
    {
        "requirement_id": "REQ-OWNERS",
        "label": "Beneficial ownership evidence",
        "description": "Beneficial owners and ownership percentages require evidence.",
        "required": True,
    },
    {
        "requirement_id": "REQ-STRUCTURE",
        "label": "Ownership structure evidence",
        "description": "Intermediate ownership layers require supporting evidence.",
        "required": True,
    },
    {
        "requirement_id": "REQ-DECLARATION",
        "label": "Onboarding declaration",
        "description": "A completed onboarding declaration is required.",
        "required": True,
    },
]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_phase3_state(state: dict[str, Any]) -> dict[str, Any]:
    state.setdefault("investigations", {})
    state.setdefault("analyst_decisions", [])
    state.setdefault("audit_events", [])
    state.setdefault("screening_seed_version", "1.0.0")
    return state


def add_audit(
    state: dict[str, Any],
    case_id: str,
    event_type: str,
    actor_type: str,
    title: str,
    detail: str,
    investigation_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    state["audit_events"].append(
        {
            "event_id": f"AUD-{uuid4()}",
            "case_id": case_id,
            "investigation_id": investigation_id,
            "event_type": event_type,
            "actor_type": actor_type,
            "title": title,
            "detail": detail,
            "occurred_at": utc_now(),
            "metadata": metadata or {},
        }
    )


class InvestigationService:
    def __init__(
        self,
        store: StateStore,
        case_service: CaseService,
        agents: AgentGateway,
        screening: ScreeningGateway,
        settings: Settings,
    ) -> None:
        self.store = store
        self.case_service = case_service
        self.agents = agents
        self.screening = screening
        self.settings = settings
        self.validators = {agent["name"]: Draft202012Validator(agent["schema"]) for agent in AGENTS}

    def recover_interrupted(self) -> None:
        state = self.store.load()
        changed = any(
            key not in state
            for key in ("investigations", "analyst_decisions", "audit_events", "screening_seed_version")
        )
        state = ensure_phase3_state(state)
        for investigation in state["investigations"].values():
            if investigation["status"] in {"queued", "running"}:
                investigation["status"] = "failed"
                investigation["error"] = {
                    "stage": investigation["current_stage"],
                    "code": "interrupted",
                    "user_message": "The previous investigation was interrupted. Retry will continue from the last checkpoint.",
                    "retryable": True,
                }
                running = next(
                    (stage for stage in investigation["stages"] if stage["status"] == "running"),
                    None,
                )
                if running:
                    running["status"] = "failed"
                    running["completed_at"] = utc_now()
                    running["message"] = investigation["error"]["user_message"]
                    running["retryable"] = True
                investigation["updated_at"] = utc_now()
                changed = True
        if changed:
            self.store.save(state)

    def start(self, case_id: str, retry_failed: bool) -> dict[str, Any]:
        state = ensure_phase3_state(self.store.load())
        case = self._case(state, case_id)
        existing = self._latest(state, case_id)
        if existing and existing["status"] in {"queued", "running"}:
            return self._start_response(existing)
        if retry_failed and existing and existing["status"] == "failed":
            existing["attempt"] += 1
            existing["status"] = "queued"
            existing["error"] = None
            existing["completed_at"] = None
            existing["updated_at"] = utc_now()
            failed_seen = False
            for stage in existing["stages"]:
                if stage["status"] == "failed":
                    failed_seen = True
                if failed_seen:
                    stage.update(
                        {
                            "status": "pending",
                            "started_at": None,
                            "completed_at": None,
                            "message": "Waiting",
                            "retryable": False,
                        }
                    )
            add_audit(
                state,
                case_id,
                "investigation_started",
                "AI",
                "AI investigation retry queued",
                f"Retry attempt {existing['attempt']} queued from the first incomplete stage.",
                existing["investigation_id"],
            )
            self.store.save(state)
            return self._start_response(existing)

        investigation_id = f"INV-{uuid4()}"
        now = utc_now()
        investigation = {
            "investigation_id": investigation_id,
            "case_id": case_id,
            "status": "queued",
            "attempt": 1,
            "current_stage": STAGES[0][0],
            "percent_complete": 0,
            "started_at": None,
            "updated_at": now,
            "completed_at": None,
            "stages": [
                {
                    "stage": key,
                    "label": label,
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None,
                    "message": "Waiting",
                    "retryable": False,
                }
                for key, label in STAGES
            ],
            "profile": None,
            "completeness": None,
            "screening_candidates": [],
            "risk": None,
            "summary": None,
            "evidence": [],
            "agent_runs": [],
            "error": None,
        }
        state["investigations"][investigation_id] = investigation
        case["status"] = "Investigating"
        add_audit(
            state,
            case_id,
            "investigation_started",
            "AI",
            "AI investigation queued",
            "A seven-stage AI-assisted investigation was queued.",
            investigation_id,
        )
        self.store.save(state)
        return self._start_response(investigation)

    def run(self, investigation_id: str) -> None:
        state = ensure_phase3_state(self.store.load())
        investigation = state["investigations"][investigation_id]
        investigation["status"] = "running"
        investigation["started_at"] = investigation["started_at"] or utc_now()
        investigation["updated_at"] = utc_now()
        self.store.save(state)
        warning = False
        for index, (stage_name, _) in enumerate(STAGES):
            state = ensure_phase3_state(self.store.load())
            investigation = state["investigations"][investigation_id]
            stage = self._stage(investigation, stage_name)
            if stage["status"] in {"completed", "completed_with_warning"}:
                warning = warning or stage["status"] == "completed_with_warning"
                continue
            self._begin_stage(state, investigation, stage)
            try:
                stage_warning = self._execute_stage(state, investigation, stage_name)
                warning = warning or stage_warning
                stage = self._stage(investigation, stage_name)
                self._complete_stage(state, investigation, stage, stage_warning, index)
            except Exception as exc:
                logger.exception(
                    "Investigation stage failed",
                    extra={"investigation_id": investigation_id, "stage": stage_name},
                )
                self._fail_stage(state, investigation, stage, exc)
                return
        state = ensure_phase3_state(self.store.load())
        investigation = state["investigations"][investigation_id]
        investigation["status"] = "completed_with_warnings" if warning else "completed"
        investigation["percent_complete"] = 100
        investigation["completed_at"] = utc_now()
        investigation["updated_at"] = investigation["completed_at"]
        add_audit(
            state,
            investigation["case_id"],
            "investigation_completed",
            "AI",
            "AI investigation completed",
            "Investigation completed with warnings." if warning else "All investigation stages completed.",
            investigation_id,
        )
        self.store.save(state)

    def get(self, case_id: str) -> dict[str, Any] | None:
        state = ensure_phase3_state(self.store.load())
        investigation = self._latest(state, case_id)
        return deepcopy(investigation) if investigation else None

    def output(self, case_id: str, key: str) -> Any:
        investigation = self.get(case_id)
        return investigation.get(key) if investigation else None

    def audit(self, case_id: str) -> list[dict[str, Any]]:
        state = ensure_phase3_state(self.store.load())
        self._case(state, case_id)
        events = [event for event in state["audit_events"] if event["case_id"] == case_id]
        return sorted(events, key=lambda event: event["occurred_at"])

    def decide(
        self,
        case_id: str,
        investigation_id: str,
        action: str,
        reason: str,
        analyst_name: str,
        decision_id: str | None,
    ) -> dict[str, Any]:
        state = ensure_phase3_state(self.store.load())
        case = self._case(state, case_id)
        for existing in state["analyst_decisions"]:
            if decision_id and existing["decision_id"] == decision_id:
                return deepcopy(existing)
        latest = self._latest(state, case_id)
        if not latest or latest["investigation_id"] != investigation_id:
            raise ValueError("stale_investigation")
        if latest["status"] not in {"completed", "completed_with_warnings"}:
            raise ValueError("incomplete_investigation")
        new_status = {
            "Approve": "Approved",
            "Request More Information": "Awaiting Information",
            "Escalate": "Escalated",
        }[action]
        previous_status = case["status"]
        decided_at = utc_now()
        decision = {
            "decision_id": decision_id or f"DEC-{uuid4()}",
            "case_id": case_id,
            "investigation_id": investigation_id,
            "action": action,
            "reason": reason.strip(),
            "analyst_name": analyst_name.strip(),
            "decided_at": decided_at,
            "previous_status": previous_status,
            "new_status": new_status,
        }
        case["status"] = new_status
        case["last_modified"] = decided_at[:10]
        state["analyst_decisions"].append(decision)
        add_audit(
            state,
            case_id,
            "analyst_decision_recorded",
            "Human",
            f"Analyst selected {action}",
            reason.strip(),
            investigation_id,
            {"analyst_name": analyst_name.strip(), "decision_id": decision["decision_id"]},
        )
        add_audit(
            state,
            case_id,
            "case_status_changed",
            "Human",
            f"Case status changed to {new_status}",
            f"Status changed from {previous_status} to {new_status}.",
            investigation_id,
            {"previous_status": previous_status, "new_status": new_status},
        )
        self.store.save(state)
        return deepcopy(decision)

    def _execute_stage(
        self, state: dict[str, Any], investigation: dict[str, Any], stage_name: str
    ) -> bool:
        case_id = investigation["case_id"]
        case = self._case(state, case_id)
        if stage_name == "reading_documents":
            self.store.save(state)
            for document in case["documents"]:
                if document["processing_status"] != "processed":
                    self.case_service.process_document(case_id, document["id"])
            refreshed = ensure_phase3_state(self.store.load())
            current = refreshed["investigations"][investigation["investigation_id"]]
            current["evidence"] = self._document_evidence(self._case(refreshed, case_id))
            current["evidence"].extend(self._note_evidence(self._case(refreshed, case_id)))
            self.store.save(refreshed)
            state.clear()
            state.update(refreshed)
            investigation.clear()
            investigation.update(current)
            return False
        if stage_name == "extracting_profile":
            payload = self._document_payload(case, investigation)
            output, response_id = self._invoke(self.settings.foundry_agent_document_name, payload)
            self._validate_evidence_refs(output, investigation["evidence"])
            investigation["profile"] = output
            self._record_agent(investigation, self.settings.foundry_agent_document_name, self.settings.foundry_agent_document_version, response_id)
            return False
        if stage_name == "checking_completeness":
            completeness_requirements = [
                requirement
                for requirement in REQUIREMENTS
                if requirement["requirement_id"] in {"REQ-REG", "REQ-ADDRESS"}
            ]
            payload = {
                "schema_version": "1.0",
                "investigation_id": investigation["investigation_id"],
                "case_id": case_id,
                "synthetic_data": True,
                "profile": investigation["profile"],
                "requirements": completeness_requirements,
                "available_evidence": [
                    evidence
                    for evidence in investigation["evidence"]
                    if evidence["evidence_id"] == "EV-DOC-001-REG"
                ],
            }
            output, response_id = self._invoke(self.settings.foundry_agent_completeness_name, payload)
            self._recalculate_completeness(output)
            self._validate_evidence_refs(output, investigation["evidence"])
            investigation["completeness"] = output
            self._record_agent(investigation, self.settings.foundry_agent_completeness_name, self.settings.foundry_agent_completeness_version, response_id)
            return False
        if stage_name == "retrieving_screening":
            try:
                candidates = self._screen(investigation["profile"])
                investigation["screening_candidates"] = candidates
                investigation["evidence"].extend(self._search_evidence(candidates))
                add_audit(
                    state,
                    case_id,
                    "screening_retrieved",
                    "AI",
                    "Synthetic screening references retrieved",
                    f"{len(candidates)} candidate references retrieved for analyst review.",
                    investigation["investigation_id"],
                )
                return False
            except Exception:
                logger.exception("Synthetic screening retrieval failed")
                investigation["screening_candidates"] = []
                investigation["screening_unavailable"] = True
                add_audit(
                    state,
                    case_id,
                    "screening_unavailable",
                    "System",
                    "Synthetic screening temporarily unavailable",
                    "Risk analysis continued using available case evidence.",
                    investigation["investigation_id"],
                )
                return True
        if stage_name == "investigating_risk":
            notes = self._notes(case)
            payload = {
                "schema_version": "1.0",
                "investigation_id": investigation["investigation_id"],
                "case_id": case_id,
                "synthetic_data": True,
                "profile": investigation["profile"],
                "completeness": investigation["completeness"],
                "existing_analyst_notes": notes,
                "screening_status": "unavailable" if investigation.get("screening_unavailable") else "available",
                "screening_candidates": investigation["screening_candidates"],
            }
            output, response_id = self._invoke(self.settings.foundry_agent_risk_name, payload)
            self._normalize_risk(output, bool(investigation.get("screening_unavailable")))
            self._validate_evidence_refs(output, investigation["evidence"])
            investigation["risk"] = output
            self._record_agent(investigation, self.settings.foundry_agent_risk_name, self.settings.foundry_agent_risk_version, response_id)
            return bool(investigation.get("screening_unavailable"))
        if stage_name == "preparing_summary":
            payload = {
                "schema_version": "1.0",
                "investigation_id": investigation["investigation_id"],
                "case_id": case_id,
                "synthetic_data": True,
                "profile": investigation["profile"],
                "completeness": investigation["completeness"],
                "risk": investigation["risk"],
                "existing_analyst_notes": [
                    {key: value for key, value in note.items() if key != "evidence_id"}
                    for note in self._notes(case)
                ],
            }
            output, response_id = self._invoke(self.settings.foundry_agent_summary_name, payload)
            output["advisory_only"] = True
            self._validate_evidence_refs(output, investigation["evidence"])
            investigation["summary"] = output
            self._record_agent(investigation, self.settings.foundry_agent_summary_name, self.settings.foundry_agent_summary_version, response_id)
            return bool(investigation.get("screening_unavailable"))
        if stage_name == "saving_results":
            case["status"] = "Ready for Decision"
            case["last_modified"] = utc_now()[:10]
            return bool(investigation.get("screening_unavailable"))
        raise RuntimeError(f"Unknown investigation stage: {stage_name}")

    def _invoke(self, agent_name: str, payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
        output, response_id = self.agents.invoke(agent_name, payload)
        self.validators[agent_name].validate(output)
        return output, response_id

    def _screen(self, profile: dict[str, Any]) -> list[dict[str, Any]]:
        subjects: list[str] = []
        if profile.get("legal_company_name"):
            subjects.append(profile["legal_company_name"]["value"])
        subjects.extend(person["full_name"] for person in profile.get("beneficial_owners", []))
        candidates: list[dict[str, Any]] = []
        seen: set[str] = set()
        for subject in subjects:
            for result in self.screening.search(subject):
                record_id = result["record_id"]
                if record_id in seen:
                    continue
                seen.add(record_id)
                display_name = result["display_name"]
                candidates.append(
                    {
                        "record_id": record_id,
                        "record_type": result["record_type"],
                        "display_name": display_name,
                        "aliases": result.get("aliases") or [],
                        "countries": result.get("countries") or [],
                        "date_of_birth": result.get("date_of_birth") or None,
                        "entity_type": result["entity_type"],
                        "category": result["category"],
                        "synthetic_risk_description": result["synthetic_risk_description"],
                        "matched_case_subject": subject,
                        "match_basis": self._match_basis(subject, display_name, result.get("aliases") or []),
                        "search_score": result.get("@search.score"),
                        "evidence_id": f"EV-SEARCH-{record_id}",
                    }
                )
        return candidates[:5]

    @staticmethod
    def _match_basis(subject: str, display_name: str, aliases: list[str]) -> list[str]:
        normalized = subject.casefold().strip()
        options = [display_name, *aliases]
        if any(normalized == option.casefold().strip() for option in options):
            return ["exact_name"]
        subject_tokens = set(normalized.split())
        if any(subject_tokens & set(option.casefold().split()) for option in options):
            return ["token_similarity", "fuzzy_similarity"]
        return ["fuzzy_similarity"]

    @staticmethod
    def _normalize_risk(output: dict[str, Any], unavailable: bool) -> None:
        output["screening_status"] = "unavailable" if unavailable else "completed"
        if unavailable:
            output["limitations"].append("Synthetic screening retrieval was unavailable for this attempt.")
        for finding in output["findings"]:
            if finding["category"] in {"potential_screening_similarity", "synthetic_pep_indicator"}:
                finding["potential_match"] = True
                finding["analyst_review_required"] = True
                if POTENTIAL_MATCH_DISCLAIMER not in finding["description"]:
                    finding["description"] = f"{POTENTIAL_MATCH_DISCLAIMER} {finding['description']}"

    @staticmethod
    def _recalculate_completeness(output: dict[str, Any]) -> None:
        statuses = [finding["status"] for finding in output["findings"]]
        output["counts"] = {
            "complete": statuses.count("Complete"),
            "missing": statuses.count("Missing"),
            "needs_review": statuses.count("Needs Review"),
            "conflicting": statuses.count("Conflicting"),
        }
        output["completeness_percent"] = round(
            (output["counts"]["complete"] / len(statuses)) * 100
        ) if statuses else 0

    def _document_payload(self, case: dict[str, Any], investigation: dict[str, Any]) -> dict[str, Any]:
        evidence_by_document: dict[str, list[dict[str, Any]]] = {}
        for evidence in investigation["evidence"]:
            if evidence["source_type"] == "document_extraction":
                evidence_by_document.setdefault(evidence["document_id"], []).append(evidence)
        processed_documents = [
            document for document in case["documents"] if document.get("extraction")
        ]
        focused_documents = [
            document
            for document in processed_documents
            if document["id"] in {"DOC-001", "DOC-003"}
        ] or processed_documents[:2]
        focused_fields = {
            "DOC-001": {"legal_name", "registration_number"},
            "DOC-003": {"beneficial_owners", "ownership_note"},
        }
        return {
            "schema_version": "1.0",
            "investigation_id": investigation["investigation_id"],
            "case_id": case["id"],
            "synthetic_data": True,
            "case_record": {
                "company_name": case["company"],
                "country": case["country"],
                "onboarding_type": case["onboarding_type"],
                "submitted_date": case["submitted_date"],
            },
            "documents": [
                {
                    "document_id": document["id"],
                    "document_type": document["type"],
                    "file_name": document["file_name"],
                    "processed_at": document["extraction"]["processed_at"],
                    "model_id": document["extraction"]["model_id"],
                    "page_count": document["extraction"]["page_count"],
                    "content_excerpt": document["extraction"]["content_excerpt"][:300],
                    "extracted_fields": [
                        {
                            "field_name": evidence["field_name"],
                            "value": evidence["value"],
                            "confidence": evidence["confidence"],
                            "page_number": evidence["page_number"],
                            "evidence_id": evidence["evidence_id"],
                            "excerpt": evidence["excerpt"],
                        }
                        for evidence in evidence_by_document.get(document["id"], [])
                        if evidence["field_name"] in focused_fields.get(
                            document["id"], {evidence["field_name"]}
                        )
                    ],
                }
                for document in focused_documents
            ],
        }

    @staticmethod
    def _document_evidence(case: dict[str, Any]) -> list[dict[str, Any]]:
        evidence: list[dict[str, Any]] = []
        suffixes = {
            "legal_name": "NAME",
            "registration_number": "REG",
            "incorporation_country": "COUNTRY",
            "registered_address": "ADDRESS",
            "document_date": "DATE",
            "directors": "DIRECTORS",
            "beneficial_owners": "OWNER",
            "ownership_note": "OWNERSHIP",
        }
        for document in case["documents"]:
            extraction = document.get("extraction")
            if not extraction:
                continue
            for field_name, field in extraction.get("fields", {}).items():
                evidence.append(
                    {
                        "evidence_id": f"EV-{document['id']}-{suffixes.get(field_name, field_name.upper())}",
                        "source_type": "document_extraction",
                        "source_id": document["id"],
                        "document_id": document["id"],
                        "document_type": document["type"],
                        "page_number": 1,
                        "field_name": field_name,
                        "excerpt": field["evidence"][:300],
                        "value": field["value"],
                        "confidence": field.get("confidence"),
                        "content_url": f"/api/cases/{case['id']}/documents/{document['id']}/content",
                        "search_index": None,
                        "search_score": None,
                    }
                )
        return evidence

    def _search_evidence(self, candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                "evidence_id": candidate["evidence_id"],
                "source_type": "synthetic_screening",
                "source_id": candidate["record_id"],
                "document_id": None,
                "document_type": None,
                "page_number": None,
                "field_name": "display_name",
                "excerpt": (
                    f"{candidate['display_name']} — {candidate['synthetic_risk_description']}"
                )[:300],
                "value": candidate["display_name"],
                "confidence": None,
                "content_url": None,
                "search_index": self.settings.azure_search_index_name,
                "search_score": candidate["search_score"],
                "source_label": "Synthetic demo screening data",
            }
            for candidate in candidates
        ]

    @staticmethod
    def _note_evidence(case: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            {
                "evidence_id": note["evidence_id"],
                "source_type": "analyst_note",
                "source_id": note["note_id"],
                "document_id": None,
                "document_type": None,
                "page_number": None,
                "field_name": "analyst_note",
                "excerpt": note["note"],
                "value": note["note"],
                "confidence": None,
                "content_url": None,
                "search_index": None,
                "search_score": None,
                "source_label": "Existing fictional analyst note",
            }
            for note in InvestigationService._notes(case)
        ]

    @staticmethod
    def _notes(case: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            {
                "note_id": "NOTE-OWNERSHIP-001",
                "note": "Supporting evidence for one intermediate ownership layer is pending.",
                "created_at": "2026-09-30T00:00:00+00:00",
                "evidence_id": "EV-NOTE-OWNERSHIP-001",
            }
        ] if case["id"] == "KYC-2026-001" else []

    @staticmethod
    def _record_agent(
        investigation: dict[str, Any], name: str, version: str, response_id: str
    ) -> None:
        investigation["agent_runs"].append(
            {
                "agent_name": name,
                "agent_version": version,
                "response_id": response_id,
                "completed_at": utc_now(),
            }
        )

    @staticmethod
    def _validate_evidence_refs(output: Any, evidence: list[dict[str, Any]]) -> None:
        known = {item["evidence_id"] for item in evidence}
        referenced = InvestigationService._evidence_refs(output)
        unknown = referenced - known
        if unknown:
            raise ValueError(f"Agent output referenced unknown evidence IDs: {sorted(unknown)}")

    @staticmethod
    def _evidence_refs(output: Any) -> set[str]:
        referenced: set[str] = set()
        def collect(value: Any) -> None:
            if isinstance(value, dict):
                for key, item in value.items():
                    if key == "evidence_refs" and isinstance(item, list):
                        referenced.update(str(reference) for reference in item)
                    else:
                        collect(item)
            elif isinstance(value, list):
                for item in value:
                    collect(item)

        collect(output)
        return referenced

    def _begin_stage(
        self, state: dict[str, Any], investigation: dict[str, Any], stage: dict[str, Any]
    ) -> None:
        now = utc_now()
        investigation["current_stage"] = stage["stage"]
        investigation["updated_at"] = now
        stage.update(
            {
                "status": "running",
                "started_at": now,
                "completed_at": None,
                "message": stage["label"],
                "retryable": False,
            }
        )
        self.store.save(state)

    def _complete_stage(
        self,
        state: dict[str, Any],
        investigation: dict[str, Any],
        stage: dict[str, Any],
        warning: bool,
        index: int,
    ) -> None:
        now = utc_now()
        stage.update(
            {
                "status": "completed_with_warning" if warning else "completed",
                "completed_at": now,
                "message": "Completed with a recoverable warning" if warning else "Completed",
            }
        )
        investigation["percent_complete"] = round(((index + 1) / len(STAGES)) * 100)
        investigation["updated_at"] = now
        add_audit(
            state,
            investigation["case_id"],
            "stage_completed",
            "AI" if stage["stage"] not in {"reading_documents", "saving_results"} else "System",
            stage["label"],
            stage["message"],
            investigation["investigation_id"],
            {"stage": stage["stage"]},
        )
        self.store.save(state)

    def _fail_stage(
        self,
        state: dict[str, Any],
        investigation: dict[str, Any],
        stage: dict[str, Any],
        exc: Exception,
    ) -> None:
        now = utc_now()
        message = "This investigation stage could not be completed. Earlier results were preserved and the investigation can be retried."
        stage.update(
            {
                "status": "failed",
                "completed_at": now,
                "message": message,
                "retryable": True,
            }
        )
        investigation["status"] = "failed"
        investigation["updated_at"] = now
        investigation["completed_at"] = now
        investigation["error"] = {
            "stage": stage["stage"],
            "code": type(exc).__name__,
            "user_message": message,
            "retryable": True,
        }
        add_audit(
            state,
            investigation["case_id"],
            "stage_failed",
            "AI",
            f"{stage['label']} failed",
            message,
            investigation["investigation_id"],
            {"stage": stage["stage"]},
        )
        self.store.save(state)

    @staticmethod
    def _stage(investigation: dict[str, Any], stage_name: str) -> dict[str, Any]:
        return next(stage for stage in investigation["stages"] if stage["stage"] == stage_name)

    @staticmethod
    def _case(state: dict[str, Any], case_id: str) -> dict[str, Any]:
        case = next((item for item in state["cases"] if item["id"] == case_id), None)
        if not case:
            raise KeyError("case")
        return case

    @staticmethod
    def _latest(state: dict[str, Any], case_id: str) -> dict[str, Any] | None:
        investigations = [
            item for item in state["investigations"].values() if item["case_id"] == case_id
        ]
        return max(investigations, key=lambda item: item["updated_at"]) if investigations else None

    @staticmethod
    def _start_response(investigation: dict[str, Any]) -> dict[str, Any]:
        return {
            "investigation_id": investigation["investigation_id"],
            "status": investigation["status"],
            "progress_url": f"/api/cases/{investigation['case_id']}/investigation",
        }
