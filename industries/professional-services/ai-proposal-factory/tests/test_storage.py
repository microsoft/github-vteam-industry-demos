from azure.core.exceptions import ResourceExistsError

from app.backend.storage.store import AzureStore


class ExistingContainer:
    def __init__(self) -> None:
        self.create_attempts = 0

    def create_container(self) -> None:
        self.create_attempts += 1
        raise ResourceExistsError("ContainerAlreadyExists")


def test_existing_blob_container_is_ready_for_upload() -> None:
    container = ExistingContainer()

    AzureStore._ensure_blob_container(container)

    assert container.create_attempts == 1
