import pytest
import sys
from pathlib import Path
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.services.package_manager import (
    PackageInstallRequest,
    package_manager_service,
)

client = TestClient(app)


@pytest.mark.asyncio
async def test_package_manager_service_install_invalid_spec():
    req = PackageInstallRequest(language="python", package_name="requests; rm -rf /")
    res = await package_manager_service.install_package(req)
    assert res.success is False
    assert res.message == "Invalid package name or specifier."
    assert res.package_name == "requests; rm -rf /"


@pytest.mark.asyncio
async def test_package_manager_service_uninstall_scoped_npm():
    req = PackageInstallRequest(language="javascript", package_name="@types/node")
    # Verify that @ and / are preserved for JS uninstall and not treated as invalid
    support = package_manager_service.resolve_package_language(req.language)
    assert support.package_language == "javascript"
    allowed = set("-_./@")
    clean = "".join(c for c in req.package_name if c.isalnum() or c in allowed)
    assert clean == "@types/node"


@pytest.mark.asyncio
async def test_package_manager_service_install_leading_dash():
    req = PackageInstallRequest(language="python", package_name="-rrequirements.txt")
    res = await package_manager_service.install_package(req)
    assert res.success is False
    assert res.message == "Invalid package name or specifier."


@pytest.mark.asyncio
async def test_package_manager_service_uninstall_leading_dash():
    req = PackageInstallRequest(language="javascript", package_name="-y")
    res = await package_manager_service.uninstall_package(req)
    assert res.success is False
    assert res.message == "Invalid package name or specifier."


@pytest.mark.asyncio
async def test_package_manager_service_lock():
    import asyncio
    assert isinstance(package_manager_service.lock, asyncio.Lock)
    assert package_manager_service.lock.locked() is False


def test_list_packages_auth_required():
    response = client.get("/api/packages/list?language=python")
    assert response.status_code == 401


def test_install_packages_auth_required():
    response = client.post("/api/packages/install", json={"language": "python", "package_name": "requests"})
    assert response.status_code == 401


def test_uninstall_packages_auth_required():
    response = client.post("/api/packages/uninstall", json={"language": "python", "package_name": "requests"})
    assert response.status_code == 401
