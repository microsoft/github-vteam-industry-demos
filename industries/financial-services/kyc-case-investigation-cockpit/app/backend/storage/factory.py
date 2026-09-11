import os

from app.backend.storage.azure import AzureStorageState
from app.backend.storage.base import DemoState
from app.backend.storage.memory import MemoryDemoState


def build_state() -> DemoState:
    if os.getenv("STORAGE_PROVIDER", "memory").strip().lower() == "azure":
        return AzureStorageState(
            account_name=os.environ["AZURE_STORAGE_ACCOUNT_NAME"],
            blob_container=os.getenv(
                "AZURE_STORAGE_BLOB_CONTAINER", "kyc-documents"
            ),
        )
    return MemoryDemoState()
