from app.backend.storage import factory
from app.backend.storage.memory import MemoryDemoState


def test_storage_factory_defaults_to_memory(monkeypatch) -> None:
    monkeypatch.delenv("STORAGE_PROVIDER", raising=False)
    assert isinstance(factory.build_state(), MemoryDemoState)


def test_storage_factory_builds_azure_state_from_environment(monkeypatch) -> None:
    sentinel = object()
    monkeypatch.setenv("STORAGE_PROVIDER", "azure")
    monkeypatch.setenv("AZURE_STORAGE_ACCOUNT_NAME", "stexample")
    monkeypatch.setenv("AZURE_STORAGE_BLOB_CONTAINER", "documents")
    monkeypatch.setattr(
        factory,
        "AzureStorageState",
        lambda account_name, blob_container: sentinel,
    )

    assert factory.build_state() is sentinel
