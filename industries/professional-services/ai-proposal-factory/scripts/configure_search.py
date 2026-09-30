#!/usr/bin/env python3
"""Create the Phase 3 Search index and optionally upload synthetic knowledge."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
from typing import Any, Iterable

from azure.identity import DefaultAzureCredential
from azure.search.documents import SearchClient
from azure.search.documents.indexes import SearchIndexClient
from azure.search.documents.indexes.models import (
    SearchField,
    SearchFieldDataType,
    SearchIndex,
    SearchableField,
    SimpleField,
)


INDEX_NAME = "knowledge-items"


def build_index(name: str) -> SearchIndex:
    return SearchIndex(
        name=name,
        fields=[
            SimpleField(
                name="id",
                type=SearchFieldDataType.String,
                key=True,
                filterable=True,
            ),
            SearchableField(
                name="title",
                type=SearchFieldDataType.String,
                searchable=True,
                filterable=True,
                sortable=True,
            ),
            SearchableField(
                name="content",
                type=SearchFieldDataType.String,
                searchable=True,
            ),
            SimpleField(
                name="kind",
                type=SearchFieldDataType.String,
                filterable=True,
                facetable=True,
            ),
            SimpleField(
                name="industry",
                type=SearchFieldDataType.String,
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
            SimpleField(
                name="sourceBlobName",
                type=SearchFieldDataType.String,
                filterable=True,
            ),
        ],
    )


def _stable_id(relative_path: str, title: str) -> str:
    digest = hashlib.sha256(f"{relative_path}\n{title}".encode("utf-8")).hexdigest()
    return f"knowledge-{digest[:24]}"


def _normalise(item: dict[str, Any], relative_path: str, fallback_content: str = "") -> dict[str, Any]:
    title = str(item.get("title") or item.get("name") or Path(relative_path).stem)
    content = str(item.get("content") or item.get("body") or item.get("text") or fallback_content)
    if not content.strip():
        raise ValueError(f"Knowledge item {relative_path!r} has no content.")
    raw_tags = item.get("tags") or []
    if isinstance(raw_tags, str):
        raw_tags = [part.strip() for part in raw_tags.split(",") if part.strip()]
    return {
        "id": str(item.get("id") or _stable_id(relative_path, title)),
        "title": title,
        "content": content,
        "kind": str(item.get("kind") or item.get("type") or "knowledge"),
        "industry": str(item.get("industry") or "general"),
        "tags": [str(tag) for tag in raw_tags],
        "sourceBlobName": str(item.get("sourceBlobName") or relative_path).replace("\\", "/"),
    }


def load_documents(data_dir: Path) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    root = data_dir.parent if data_dir.is_file() else data_dir
    candidates = [data_dir] if data_dir.is_file() else list(data_dir.rglob("*"))
    for path in sorted(
        p
        for p in candidates
        if p.is_file() and p.suffix.lower() in {".json", ".md", ".txt"}
    ):
        relative_path = str(path.relative_to(root)).replace("\\", "/")
        if path.suffix.lower() == ".json":
            payload = json.loads(path.read_text(encoding="utf-8"))
            values: Iterable[Any]
            if isinstance(payload, list):
                values = payload
            elif isinstance(payload, dict) and isinstance(payload.get("items"), list):
                values = payload["items"]
            else:
                values = [payload]
            for index, value in enumerate(values):
                if not isinstance(value, dict):
                    raise ValueError(f"{relative_path} item {index} must be an object.")
                source = relative_path if index == 0 else f"{relative_path}#{index}"
                documents.append(_normalise(value, source))
        else:
            content = path.read_text(encoding="utf-8")
            documents.append(_normalise({}, relative_path, content))
    return documents


def upload_batches(client: SearchClient, documents: list[dict[str, Any]]) -> None:
    for start in range(0, len(documents), 500):
        batch = documents[start : start + 500]
        results = client.merge_or_upload_documents(documents=batch)
        failures = [result for result in results if not result.succeeded]
        if failures:
            messages = ", ".join(f"{item.key}: {item.error_message}" for item in failures)
            raise RuntimeError(f"Search upload failed: {messages}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--endpoint", default=os.getenv("AZURE_SEARCH_ENDPOINT"))
    parser.add_argument("--index-name", default=os.getenv("AZURE_SEARCH_INDEX_NAME", INDEX_NAME))
    parser.add_argument("--data-dir", type=Path, help="Optional synthetic knowledge directory.")
    args = parser.parse_args()

    if not args.endpoint:
        parser.error("--endpoint or AZURE_SEARCH_ENDPOINT is required")
    if args.index_name != INDEX_NAME:
        raise SystemExit(f"Phase 3 requires the index name {INDEX_NAME!r}.")
    if not args.endpoint.startswith("https://srch-prof-services-04-") or not args.endpoint.endswith(
        ".search.windows.net"
    ):
        raise SystemExit("Refusing to configure an unexpected Search service.")

    credential = DefaultAzureCredential()
    index_client = SearchIndexClient(endpoint=args.endpoint, credential=credential)
    index = index_client.create_or_update_index(build_index(args.index_name))

    documents: list[dict[str, Any]] = []
    if args.data_dir and args.data_dir.exists():
        documents = load_documents(args.data_dir)
        if documents:
            search_client = SearchClient(
                endpoint=args.endpoint,
                index_name=args.index_name,
                credential=credential,
            )
            upload_batches(search_client, documents)

    print(
        json.dumps(
            {
                "endpoint": args.endpoint,
                "indexName": index.name,
                "documentCountUploaded": len(documents),
                "uploadDeferred": not bool(documents),
            },
            indent=2,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
