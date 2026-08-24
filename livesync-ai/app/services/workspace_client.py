import json
import logging
import urllib.error
import urllib.request
from typing import Any
from app.config import settings

logger = logging.getLogger(__name__)


class WorkspaceClient:
    """
    Client for on-demand retrieval of workspace file manifests and document contents
    from livesync-api enforcing user authorization (JWT).
    """

    def fetch_workspace_manifest(self, project_id: str, user_token: str | None = None) -> list[dict[str, Any]]:
        """
        Retrieves project file tree and descriptors from livesync-api GET /api/folders/:id/manifest.
        """
        if not project_id:
            return []

        base_url = settings.api_base_url.rstrip("/")
        url = f"{base_url}/api/folders/{project_id}/manifest"

        headers = {
            "Accept": "application/json",
        }
        if user_token:
            headers["Authorization"] = f"Bearer {user_token}"

        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    files = data.get("files", [])
                    return files
        except urllib.error.HTTPError as http_err:
            logger.warning(f"Failed to fetch workspace manifest {project_id} HTTP {http_err.code}: {http_err.reason}")
        except Exception as ex:
            logger.warning(f"Error fetching workspace manifest {project_id}: {ex}")
        return []

    def fetch_document_content(self, document_id: str, user_token: str | None = None) -> dict[str, Any] | None:
        """
        Retrieves a single document content and metadata from livesync-api GET /api/documents/:id.
        """
        if not document_id:
            return None

        base_url = settings.api_base_url.rstrip("/")
        url = f"{base_url}/api/documents/{document_id}"

        headers = {
            "Accept": "application/json",
        }
        if user_token:
            headers["Authorization"] = f"Bearer {user_token}"

        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as http_err:
            logger.warning(f"Failed to fetch document {document_id} HTTP {http_err.code}: {http_err.reason}")
        except Exception as ex:
            logger.warning(f"Error fetching document {document_id}: {ex}")
        return None


workspace_client = WorkspaceClient()
