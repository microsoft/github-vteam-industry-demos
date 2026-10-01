import json
import time
from typing import Any, Protocol

from .config import Settings


class AgentGateway(Protocol):
    def invoke(self, agent_name: str, payload: dict[str, Any]) -> tuple[dict[str, Any], str]: ...


class ScreeningGateway(Protocol):
    def search(self, subject: str) -> list[dict[str, Any]]: ...


class FoundryAgentGateway:
    def __init__(self, settings: Settings) -> None:
        if not settings.foundry_project_endpoint:
            raise RuntimeError("Microsoft Foundry project endpoint is not configured.")
        from azure.ai.projects import AIProjectClient
        from azure.identity import DefaultAzureCredential

        credential = DefaultAzureCredential(managed_identity_client_id=settings.azure_client_id or None)
        self._project = AIProjectClient(endpoint=settings.foundry_project_endpoint, credential=credential)

    def invoke(self, agent_name: str, payload: dict[str, Any]) -> tuple[dict[str, Any], str]:
        client = self._project.get_openai_client(agent_name=agent_name)
        for attempt in range(3):
            conversation = client.conversations.create()
            try:
                response = client.responses.create(
                    conversation=conversation.id,
                    input=json.dumps(payload, ensure_ascii=False),
                )
                return json.loads(response.output_text), response.id
            except Exception as exc:
                status_code = getattr(exc, "status_code", None)
                if status_code != 429 or attempt == 2:
                    raise
                response = getattr(exc, "response", None)
                retry_after = response.headers.get("retry-after") if response is not None else None
                time.sleep(max(65, int(retry_after or 0)))
            finally:
                try:
                    client.conversations.delete(conversation.id)
                except Exception:
                    pass
        raise RuntimeError("Foundry invocation retry limit reached.")


class AzureSearchGateway:
    def __init__(self, settings: Settings) -> None:
        if not settings.azure_search_endpoint:
            raise RuntimeError("Azure AI Search endpoint is not configured.")
        from azure.identity import DefaultAzureCredential
        from azure.search.documents import SearchClient

        credential = DefaultAzureCredential(managed_identity_client_id=settings.azure_client_id or None)
        self._client = SearchClient(
            settings.azure_search_endpoint,
            settings.azure_search_index_name,
            credential,
        )

    def search(self, subject: str) -> list[dict[str, Any]]:
        query = f'"{subject}" OR {subject}~1'
        results = self._client.search(
            search_text=query,
            filter="synthetic eq true",
            top=3,
            include_total_count=False,
        )
        return [dict(result) for result in results]
