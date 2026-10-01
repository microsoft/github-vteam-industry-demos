import io
import json
from copy import deepcopy
from threading import Lock
from typing import Protocol

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from .config import Settings
from .seed import build_seed_state, document_text


def render_pdf(text: str) -> bytes:
    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4)
    text_object = pdf.beginText(48, 800)
    text_object.setFont("Helvetica", 10)
    for line in text.splitlines():
        text_object.textLine(line)
    pdf.drawText(text_object)
    pdf.save()
    return output.getvalue()


class StateStore(Protocol):
    def ensure_seeded(self) -> dict: ...
    def load(self) -> dict: ...
    def save(self, state: dict) -> None: ...
    def document_bytes(self, blob_name: str) -> bytes: ...


class MemoryStateStore:
    def __init__(self) -> None:
        self._state: dict | None = None
        self._documents: dict[str, bytes] = {}
        self._lock = Lock()

    def ensure_seeded(self) -> dict:
        with self._lock:
            if self._state is None:
                self._state = build_seed_state()
                for case in self._state["cases"]:
                    for document in case["documents"]:
                        self._documents[document["blob_name"]] = render_pdf(document_text(case, document))
            return deepcopy(self._state)

    def load(self) -> dict:
        return self.ensure_seeded()

    def save(self, state: dict) -> None:
        with self._lock:
            self._state = deepcopy(state)

    def document_bytes(self, blob_name: str) -> bytes:
        self.ensure_seeded()
        return self._documents[blob_name]


class AzureBlobStateStore:
    STATE_BLOB = "state/demo-state.json"

    def __init__(self, settings: Settings) -> None:
        from azure.identity import DefaultAzureCredential
        from azure.storage.blob import BlobServiceClient

        credential = DefaultAzureCredential(managed_identity_client_id=settings.azure_client_id or None)
        account_url = f"https://{settings.storage_account_name}.blob.core.windows.net"
        self._container = BlobServiceClient(account_url, credential=credential).get_container_client(
            settings.storage_container_name
        )

    def ensure_seeded(self) -> dict:
        try:
            self._container.create_container()
        except Exception as exc:
            if "ContainerAlreadyExists" not in str(exc):
                raise
        state_blob = self._container.get_blob_client(self.STATE_BLOB)
        if state_blob.exists():
            return self.load()
        state = build_seed_state()
        for case in state["cases"]:
            for document in case["documents"]:
                blob = self._container.get_blob_client(document["blob_name"])
                if not blob.exists():
                    from azure.storage.blob import ContentSettings

                    blob.upload_blob(
                        render_pdf(document_text(case, document)),
                        overwrite=False,
                        content_settings=ContentSettings(content_type="application/pdf"),
                        metadata={"case_id": case["id"], "synthetic": "true"},
                    )
        from azure.storage.blob import ContentSettings

        state_blob.upload_blob(
            json.dumps(state, indent=2),
            overwrite=False,
            content_settings=ContentSettings(content_type="application/json"),
        )
        return state

    def load(self) -> dict:
        return json.loads(self._container.download_blob(self.STATE_BLOB).readall())

    def save(self, state: dict) -> None:
        from azure.storage.blob import ContentSettings

        self._container.upload_blob(
            self.STATE_BLOB,
            json.dumps(state, indent=2),
            overwrite=True,
            content_settings=ContentSettings(content_type="application/json"),
        )

    def document_bytes(self, blob_name: str) -> bytes:
        return self._container.download_blob(blob_name).readall()


def create_store(settings: Settings) -> StateStore:
    if settings.storage_mode == "azure":
        return AzureBlobStateStore(settings)
    return MemoryStateStore()
