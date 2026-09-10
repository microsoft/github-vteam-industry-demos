from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from azure.identity import DefaultAzureCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import SearchField, SearchFieldDataType, SearchIndex
from azure.storage.blob import BlobServiceClient


def load_knowledge(repository_root: Path) -> list[dict]:
    sys.path.insert(0, str(repository_root))
    from app.backend.seeds import build_knowledge

    return [item.model_dump(mode="json") for item in build_knowledge()]


def create_index(endpoint: str, index_name: str, credential: DefaultAzureCredential) -> None:
    index = SearchIndex(
        name=index_name,
        fields=[
            SearchField(name="id", type=SearchFieldDataType.String, key=True, filterable=True),
            SearchField(
                name="title",
                type=SearchFieldDataType.String,
                searchable=True,
                sortable=True,
            ),
            SearchField(
                name="type",
                type=SearchFieldDataType.String,
                searchable=True,
                filterable=True,
                facetable=True,
            ),
            SearchField(
                name="industry",
                type=SearchFieldDataType.String,
                searchable=True,
                filterable=True,
                facetable=True,
            ),
            SearchField(
                name="tags",
                type=SearchFieldDataType.Collection(SearchFieldDataType.String),
                searchable=True,
                filterable=True,
                facetable=True,
            ),
            SearchField(name="content", type=SearchFieldDataType.String, searchable=True),
            SearchField(name="source", type=SearchFieldDataType.String, searchable=True),
        ],
    )
    SearchIndexClient(endpoint, credential).create_or_update_index(index)


def seed_blobs(
    blob_endpoint: str,
    knowledge: list[dict],
    credential: DefaultAzureCredential,
) -> None:
    container = BlobServiceClient(blob_endpoint, credential).get_container_client("knowledge")
    for item in knowledge:
        container.upload_blob(
            name=f"{item['id']}.json",
            data=json.dumps(item, ensure_ascii=False, indent=2),
            overwrite=True,
        )


def seed_search(
    endpoint: str,
    index_name: str,
    knowledge: list[dict],
    credential: DefaultAzureCredential,
) -> dict:
    client = SearchClient(endpoint, index_name, credential)
    result = client.merge_or_upload_documents(knowledge)
    failed = [entry.key for entry in result if not entry.succeeded]
    if failed:
        raise RuntimeError(f"Failed to index documents: {failed}")

    matches = list(client.search("cloud modernization", top=3))
    if not matches:
        raise RuntimeError("Verification query returned no reusable knowledge.")
    return {
        "query": "cloud modernization",
        "top_result": {
            "id": matches[0]["id"],
            "title": matches[0]["title"],
            "type": matches[0]["type"],
            "source": matches[0]["source"],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository-root", default=".")
    args = parser.parse_args()

    required = (
        "AZURE_STORAGE_BLOB_ENDPOINT",
        "AZURE_AI_SEARCH_ENDPOINT",
        "AZURE_AI_SEARCH_INDEX_NAME",
    )
    missing = [name for name in required if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Missing environment variables: {', '.join(missing)}")

    credential = DefaultAzureCredential()
    knowledge = load_knowledge(Path(args.repository_root).resolve())
    create_index(
        os.environ["AZURE_AI_SEARCH_ENDPOINT"],
        os.environ["AZURE_AI_SEARCH_INDEX_NAME"],
        credential,
    )
    seed_blobs(os.environ["AZURE_STORAGE_BLOB_ENDPOINT"], knowledge, credential)
    retrieval = seed_search(
        os.environ["AZURE_AI_SEARCH_ENDPOINT"],
        os.environ["AZURE_AI_SEARCH_INDEX_NAME"],
        knowledge,
        credential,
    )
    print(
        json.dumps(
            {
                "knowledge_documents": len(knowledge),
                "blob_container": "knowledge",
                "search_index": os.environ["AZURE_AI_SEARCH_INDEX_NAME"],
                "retrieval": retrieval,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
