import json
from threading import RLock

from azure.core.exceptions import ResourceNotFoundError
from azure.data.tables import TableServiceClient, UpdateMode
from azure.identity import DefaultAzureCredential
from azure.storage.blob import BlobServiceClient

from app.backend.models.domain import (
    AnalystDecision,
    AuditEvent,
    InvestigationJob,
    KycCase,
    ScreeningRecord,
    utc_now,
)
from app.backend.seed.generator import SEED_VERSION, fresh_seed


class AzureStorageState:
    def __init__(
        self,
        account_name: str,
        blob_container: str = "kyc-documents",
    ) -> None:
        credential = DefaultAzureCredential()
        self.tables = TableServiceClient(
            endpoint=f"https://{account_name}.table.core.windows.net",
            credential=credential,
        )
        self.blobs = BlobServiceClient(
            account_url=f"https://{account_name}.blob.core.windows.net",
            credential=credential,
        )
        self.cases = self.tables.get_table_client("KycCases")
        self.screening = self.tables.get_table_client("KycScreening")
        self.metadata = self.tables.get_table_client("KycMetadata")
        self.investigations = self.tables.get_table_client("KycInvestigations")
        self.documents = self.blobs.get_container_client(blob_container)
        self._lock = RLock()
        self._seed_once()

    def _seed_once(self) -> None:
        try:
            metadata = self.metadata.get_entity("seed", "version")
            if metadata["Value"] == SEED_VERSION:
                return
        except ResourceNotFoundError:
            pass
        cases, screening = fresh_seed()
        for case in cases:
            self.cases.upsert_entity(
                {
                    "PartitionKey": "case",
                    "RowKey": case.id,
                    "Payload": case.model_dump_json(),
                },
                mode=UpdateMode.REPLACE,
            )
        for record in screening:
            self.screening.upsert_entity(
                {
                    "PartitionKey": "screening",
                    "RowKey": record.id,
                    "Payload": record.model_dump_json(),
                },
                mode=UpdateMode.REPLACE,
            )
        primary = cases[0]
        for document in primary.documents:
            self.documents.upload_blob(
                name=f"{primary.id}/{document.id}/{document.name}",
                data=document.preview.encode("utf-8"),
                overwrite=True,
                metadata={
                    "case_id": primary.id,
                    "document_id": document.id,
                    "synthetic": "true",
                },
            )
        self.metadata.upsert_entity(
            {
                "PartitionKey": "seed",
                "RowKey": "version",
                "Value": SEED_VERSION,
                "CaseCount": len(cases),
                "ScreeningCount": len(screening),
                "SeededAt": utc_now(),
            },
            mode=UpdateMode.REPLACE,
        )

    def list_cases(self) -> list[KycCase]:
        return [
            KycCase.model_validate_json(entity["Payload"])
            for entity in self.cases.query_entities(
                "PartitionKey eq 'case'"
            )
        ]

    def get_case(self, case_id: str) -> KycCase | None:
        try:
            entity = self.cases.get_entity("case", case_id)
        except ResourceNotFoundError:
            return None
        return KycCase.model_validate_json(entity["Payload"])

    def save_case(self, case: KycCase) -> None:
        self.cases.upsert_entity(
            {
                "PartitionKey": "case",
                "RowKey": case.id,
                "Payload": case.model_dump_json(),
            },
            mode=UpdateMode.REPLACE,
        )

    def screening_records(self) -> list[ScreeningRecord]:
        return [
            ScreeningRecord.model_validate_json(entity["Payload"])
            for entity in self.screening.query_entities(
                "PartitionKey eq 'screening'"
            )
        ]

    def get_document_content(
        self, case_id: str, document_id: str
    ) -> str | None:
        case = self.get_case(case_id)
        if not case:
            return None
        document = next(
            (item for item in case.documents if item.id == document_id), None
        )
        if not document:
            return None
        blob = self.documents.get_blob_client(
            f"{case_id}/{document.id}/{document.name}"
        )
        try:
            return blob.download_blob().readall().decode("utf-8")
        except ResourceNotFoundError:
            return document.preview

    def save_investigation_job(self, job: InvestigationJob) -> None:
        self.investigations.upsert_entity(
            {
                "PartitionKey": job.case_id,
                "RowKey": job.id,
                "Payload": job.model_dump_json(),
            },
            mode=UpdateMode.REPLACE,
        )

    def get_investigation_job(self, job_id: str) -> InvestigationJob | None:
        entities = list(
            self.investigations.query_entities(
                f"RowKey eq '{job_id}'", results_per_page=1
            )
        )
        if not entities:
            return None
        return InvestigationJob.model_validate_json(entities[0]["Payload"])

    def record_decision(
        self, case_id: str, decision: AnalystDecision
    ) -> KycCase | None:
        with self._lock:
            case = self.get_case(case_id)
            if not case:
                return None
            status_by_action = {
                "Approve": "Approved",
                "Request More Information": "Awaiting Information",
                "Escalate": "Escalated",
            }
            case.decisions.append(decision)
            case.status = status_by_action[decision.action]
            case.last_modified = decision.timestamp
            case.audit.append(
                AuditEvent(
                    id=f"AUD-{case.id}-{len(case.audit) + 1:03d}",
                    timestamp=decision.timestamp,
                    actor_type="Human Analyst",
                    actor=decision.analyst,
                    action=f"Decision recorded: {decision.action}",
                    detail=decision.reason,
                )
            )
            self.save_case(case)
            return case
