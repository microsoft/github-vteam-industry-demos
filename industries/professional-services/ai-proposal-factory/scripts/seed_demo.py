"""Seed deterministic synthetic demo data into Azure Storage and AI Search."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "app" / "backend"))

from azure.data.tables import TableServiceClient  # noqa: E402
from azure.core.exceptions import ResourceExistsError  # noqa: E402
from azure.identity import DefaultAzureCredential  # noqa: E402
from azure.search.documents import SearchClient  # noqa: E402
from azure.storage.blob import BlobServiceClient, ContentSettings  # noqa: E402

from proposal_factory.adapters import encode_opportunity_entity  # noqa: E402
from proposal_factory.config import Settings  # noqa: E402
from proposal_factory.models import Document, KnowledgeItem, Opportunity  # noqa: E402


def load_models(filename: str, model_type):
    payload = json.loads((ROOT / "data" / filename).read_text("utf-8"))
    return [model_type.model_validate(item) for item in payload]


def main() -> int:
    settings = Settings()
    settings.validate_azure_runtime()
    credential = DefaultAzureCredential(managed_identity_client_id=settings.azure_client_id)
    tables = TableServiceClient(
        settings.azure_storage_table_endpoint,
        credential=credential,
    )
    blobs = BlobServiceClient(settings.azure_storage_blob_endpoint, credential)
    search = SearchClient(
        settings.azure_search_endpoint,
        settings.azure_search_index_name,
        credential,
    )

    for table_name in ("opportunities", "generationjobs", "proposals", "auditevents"):
        tables.create_table_if_not_exists(table_name)
    for container_name in ("meeting-notes", "knowledge", "proposals"):
        try:
            blobs.create_container(container_name)
        except ResourceExistsError:
            pass

    opportunities = load_models("opportunities.json", Opportunity)
    documents = load_models("meeting-notes.json", Document)
    knowledge = load_models("knowledge.json", KnowledgeItem)

    opportunity_table = tables.get_table_client("opportunities")
    for opportunity in opportunities:
        opportunity_table.upsert_entity(
            encode_opportunity_entity(opportunity, settings.demo_seed_version)
        )

    for document in documents:
        blob_name = f"{document.opportunityId}/{document.id}.json"
        blobs.get_blob_client("meeting-notes", blob_name).upload_blob(
            document.model_dump_json(indent=2),
            overwrite=True,
            content_settings=ContentSettings(content_type="application/json"),
            metadata={"seedVersion": settings.demo_seed_version},
        )

    for item in knowledge:
        blobs.get_blob_client("knowledge", item.sourceBlobName).upload_blob(
            f"# {item.title}\n\n{item.content}\n",
            overwrite=True,
            content_settings=ContentSettings(content_type="text/markdown"),
            metadata={"seedVersion": settings.demo_seed_version, "knowledgeId": item.id},
        )

    search_payload = [item.model_dump() for item in knowledge]
    result = search.merge_or_upload_documents(search_payload)
    failures = [entry for entry in result if not entry.succeeded]
    if failures:
        details = ", ".join(f"{entry.key}: {entry.error_message}" for entry in failures)
        raise RuntimeError(f"Azure AI Search rejected seeded documents: {details}")

    print(
        f"Seeded {len(opportunities)} opportunities, {len(documents)} meeting notes, "
        f"and {len(knowledge)} knowledge items ({settings.demo_seed_version})."
    )
    return 0


if __name__ == "__main__":
    os.chdir(ROOT)
    raise SystemExit(main())
