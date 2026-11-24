import os
from datetime import datetime, timedelta, timezone
from urllib.parse import unquote

from azure.identity import DefaultAzureCredential
from azure.storage.blob import (
    BlobSasPermissions,
    BlobServiceClient,
    ContentSettings,
    generate_blob_sas,
)

CONTAINER = os.getenv("BLOB_CONTAINER", "employee-files")
SAS_MINUTES = 60

_service = None


def get_service():
    """Uses the connection string if set (local development), otherwise the managed identity."""
    global _service
    if _service is None:
        connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        if connection_string:
            _service = BlobServiceClient.from_connection_string(connection_string)
        else:
            _service = BlobServiceClient(os.environ["STORAGE_ACCOUNT_URL"], credential=DefaultAzureCredential())
    return _service


def upload_file(blob_name, data, content_type):
    """Uploads the file and returns the blob URL (without SAS token)."""
    blob = get_service().get_blob_client(CONTAINER, blob_name)
    blob.upload_blob(
        data,
        overwrite=True,
        content_settings=ContentSettings(content_type=content_type),
    )
    return blob.url


def delete_file(blob_name):
    blob = get_service().get_blob_client(CONTAINER, blob_name)
    if blob.exists():
        blob.delete_blob()


def list_files(prefix):
    container = get_service().get_container_client(CONTAINER)
    return [b.name for b in container.list_blobs(name_starts_with=prefix)]


def delete_files(prefix):
    for name in list_files(prefix):
        delete_file(name)


def blob_name_from_url(url):
    return unquote(url.split(f"/{CONTAINER}/", 1)[1])


def read_url(blob_name):
    """The container is private, so files are served through a short-lived read-only SAS URL."""
    service = get_service()
    expiry = datetime.now(timezone.utc) + timedelta(minutes=SAS_MINUTES)
    if getattr(service.credential, "account_key", None):
        signing = {"account_key": service.credential.account_key}
    else:
        # user delegation SAS: signed with the managed identity, no account key needed
        start = datetime.now(timezone.utc) - timedelta(minutes=5)
        signing = {"user_delegation_key": service.get_user_delegation_key(start, expiry)}

    token = generate_blob_sas(
        account_name=service.account_name,
        container_name=CONTAINER,
        blob_name=blob_name,
        permission=BlobSasPermissions(read=True),
        expiry=expiry,
        **signing,
    )
    blob = service.get_blob_client(CONTAINER, blob_name)
    return f"{blob.url}?{token}"
