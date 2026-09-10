import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from app.backend.config import Settings
from app.backend.container import create_services
from app.backend.models import KnowledgeItem


def main() -> None:
    services = create_services(Settings.from_environment())
    result = services.seeds.seed()
    indexed = 0
    if services.settings.search_endpoint and hasattr(services.retriever, "sync"):
        items = [
            KnowledgeItem(**item) for item in services.store.list("knowledge")
        ]
        indexed = services.retriever.sync(items)
    print(
        "Seed result: "
        f"{result['status']}; "
        f"{result['opportunities']} opportunities, "
        f"{result['knowledge']} knowledge items, "
        f"{result['documents']} documents, "
        f"{indexed} Azure AI Search documents indexed."
    )


if __name__ == "__main__":
    main()
