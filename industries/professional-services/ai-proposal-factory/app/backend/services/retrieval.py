import re
from typing import Protocol

from app.backend.config import Settings
from app.backend.models import KnowledgeItem
from app.backend.storage import Store


class KnowledgeRetriever(Protocol):
    def search(
        self, query: str, limit: int = 6, item_type: str | None = None
    ) -> list[KnowledgeItem]: ...


class LocalKnowledgeRetriever:
    def __init__(self, store: Store):
        self.store = store

    def search(
        self, query: str, limit: int = 6, item_type: str | None = None
    ) -> list[KnowledgeItem]:
        words = set(re.findall(r"[a-z0-9]+", query.lower()))
        scored: list[tuple[int, KnowledgeItem]] = []
        for raw in self.store.list("knowledge"):
            item = KnowledgeItem(**raw)
            if item_type and item.type != item_type:
                continue
            haystack = " ".join(
                [item.title, item.type, item.industry, item.content, *item.tags]
            ).lower()
            score = sum(2 if word in item.tags else 1 for word in words if word in haystack)
            scored.append((score, item))
        scored.sort(key=lambda pair: (-pair[0], pair[1].title))
        return [item for _, item in scored[:limit]]

    def sync(self, _: list[KnowledgeItem]) -> int:
        return 0


class AzureSearchRetriever:
    def __init__(self, settings: Settings):
        from azure.identity import DefaultAzureCredential
        from azure.search.documents import SearchClient

        credential = DefaultAzureCredential(
            managed_identity_client_id=settings.azure_client_id
        )
        self.client = SearchClient(
            endpoint=settings.search_endpoint,
            index_name=settings.search_index_name,
            credential=credential,
        )

    def search(
        self, query: str, limit: int = 6, item_type: str | None = None
    ) -> list[KnowledgeItem]:
        filter_expression = f"type eq '{item_type.replace(chr(39), chr(39) * 2)}'" if item_type else None
        results = self.client.search(
            search_text=query or "*",
            filter=filter_expression,
            top=limit,
        )
        items = []
        for result in results:
            items.append(
                KnowledgeItem(
                    id=str(result.get("id")),
                    title=str(result.get("title", "Reusable knowledge")),
                    type=result.get("type", "Proposal Snippet"),
                    industry=str(result.get("industry", "Cross-industry")),
                    tags=list(result.get("tags", [])),
                    content=str(result.get("content", "")),
                    source=str(result.get("source", result.get("title", "Azure AI Search"))),
                )
            )
        return items

    def sync(self, items: list[KnowledgeItem]) -> int:
        documents = [
            {
                "id": item.id,
                "title": item.title,
                "type": item.type,
                "industry": item.industry,
                "tags": item.tags,
                "content": item.content,
                "source": item.source,
            }
            for item in items
        ]
        results = self.client.merge_or_upload_documents(documents=documents)
        return sum(1 for result in results if result.succeeded)


class ResilientKnowledgeRetriever:
    def __init__(self, primary: KnowledgeRetriever, fallback: KnowledgeRetriever):
        self.primary = primary
        self.fallback = fallback

    def search(
        self, query: str, limit: int = 6, item_type: str | None = None
    ) -> list[KnowledgeItem]:
        try:
            results = self.primary.search(query, limit, item_type)
            return results or self.fallback.search(query, limit, item_type)
        except Exception:
            return self.fallback.search(query, limit, item_type)

    def sync(self, items: list[KnowledgeItem]) -> int:
        if hasattr(self.primary, "sync"):
            return self.primary.sync(items)
        return 0


def create_retriever(settings: Settings, store: Store) -> KnowledgeRetriever:
    local = LocalKnowledgeRetriever(store)
    if not settings.search_endpoint:
        return local
    return ResilientKnowledgeRetriever(AzureSearchRetriever(settings), local)
