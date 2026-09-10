import json
import threading
from pathlib import Path
from typing import Any, Protocol

from app.backend.config import Settings


COLLECTIONS = (
    "opportunities",
    "documents",
    "knowledge",
    "proposals",
    "audit",
    "jobs",
    "metadata",
)


class Store(Protocol):
    def list(self, collection: str) -> list[dict[str, Any]]: ...
    def get(self, collection: str, item_id: str) -> dict[str, Any] | None: ...
    def upsert(self, collection: str, item_id: str, value: dict[str, Any]) -> None: ...
    def delete(self, collection: str, item_id: str) -> bool: ...
    def save_document_content(self, name: str, content: bytes) -> str | None: ...


class JsonStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._lock = threading.RLock()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write({name: {} for name in COLLECTIONS})

    def _read(self) -> dict[str, dict[str, dict[str, Any]]]:
        with self._lock:
            return json.loads(self.path.read_text(encoding="utf-8"))

    def _write(self, data: dict[str, Any]) -> None:
        with self._lock:
            self.path.write_text(
                json.dumps(data, indent=2, ensure_ascii=False),
                encoding="utf-8",
            )

    def list(self, collection: str) -> list[dict[str, Any]]:
        return list(self._read().setdefault(collection, {}).values())

    def get(self, collection: str, item_id: str) -> dict[str, Any] | None:
        return self._read().setdefault(collection, {}).get(item_id)

    def upsert(self, collection: str, item_id: str, value: dict[str, Any]) -> None:
        with self._lock:
            data = self._read()
            data.setdefault(collection, {})[item_id] = value
            self._write(data)

    def delete(self, collection: str, item_id: str) -> bool:
        with self._lock:
            data = self._read()
            removed = data.setdefault(collection, {}).pop(item_id, None) is not None
            if removed:
                self._write(data)
            return removed

    def save_document_content(self, name: str, content: bytes) -> str | None:
        upload_dir = self.path.parent / "uploads"
        upload_dir.mkdir(parents=True, exist_ok=True)
        target = upload_dir / Path(name).name
        target.write_bytes(content)
        return str(target)


class AzureStore:
    TABLE_NAMES = {
        "opportunities": "Opportunities",
        "documents": "Documents",
        "knowledge": "Knowledge",
        "proposals": "Proposals",
        "audit": "AuditEvents",
        "jobs": "GenerationJobs",
        "metadata": "Metadata",
    }

    def __init__(self, settings: Settings):
        from azure.data.tables import TableServiceClient
        from azure.identity import DefaultAzureCredential

        credential = DefaultAzureCredential(
            managed_identity_client_id=settings.azure_client_id
        )
        self._service = TableServiceClient(
            endpoint=settings.storage_table_endpoint,
            credential=credential,
        )
        self._blob_endpoint = settings.storage_blob_endpoint
        self._credential = credential
        for name in self.TABLE_NAMES.values():
            self._service.create_table_if_not_exists(name)

    def _client(self, collection: str):
        return self._service.get_table_client(self.TABLE_NAMES[collection])

    def list(self, collection: str) -> list[dict[str, Any]]:
        return [
            json.loads(entity["Payload"])
            for entity in self._client(collection).list_entities()
        ]

    def get(self, collection: str, item_id: str) -> dict[str, Any] | None:
        from azure.core.exceptions import ResourceNotFoundError

        try:
            entity = self._client(collection).get_entity("aipf", item_id)
            return json.loads(entity["Payload"])
        except ResourceNotFoundError:
            return None

    def upsert(self, collection: str, item_id: str, value: dict[str, Any]) -> None:
        self._client(collection).upsert_entity(
            {
                "PartitionKey": "aipf",
                "RowKey": item_id,
                "Payload": json.dumps(value, ensure_ascii=False),
            }
        )

    def delete(self, collection: str, item_id: str) -> bool:
        from azure.core.exceptions import ResourceNotFoundError

        try:
            self._client(collection).delete_entity("aipf", item_id)
            return True
        except ResourceNotFoundError:
            return False

    @staticmethod
    def _ensure_blob_container(container) -> None:
        from azure.core.exceptions import ResourceExistsError

        try:
            container.create_container()
        except ResourceExistsError:
            pass

    def save_document_content(self, name: str, content: bytes) -> str | None:
        if not self._blob_endpoint:
            return None
        from azure.storage.blob import BlobServiceClient

        service = BlobServiceClient(self._blob_endpoint, credential=self._credential)
        container = service.get_container_client("documents")
        self._ensure_blob_container(container)
        safe_name = Path(name).name
        container.upload_blob(safe_name, content, overwrite=True)
        return safe_name


def create_store(settings: Settings) -> Store:
    if settings.storage_table_endpoint:
        return AzureStore(settings)
    return JsonStore(settings.data_path)
