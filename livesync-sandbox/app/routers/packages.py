import logging
from fastapi import APIRouter, HTTPException, Request, status
from app.services.package_manager import (
    PackageInstallRequest,
    PackageInstallResponse,
    PackageSupportResponse,
    package_manager_service,
)
from app.services.auth_service import auth_service

router = APIRouter(prefix="/api/packages", tags=["Packages"])
logger = logging.getLogger(__name__)


@router.get("/popular", status_code=status.HTTP_200_OK, summary="Get popular curated packages")
async def get_popular_packages(language: str = "python"):
    """Returns curated popular packages for the target language."""
    packages = await package_manager_service.get_popular_packages(language)
    return {"language": language, "packages": packages}


@router.get("/search", status_code=status.HTTP_200_OK, summary="Search PyPI or npm packages")
async def search_packages(q: str = "", language: str = "python"):
    """Searches PyPI or npm registry for packages matching query string."""
    results = await package_manager_service.search_packages(q, language)
    return {"query": q, "language": language, "results": results}


@router.get("/list", status_code=status.HTTP_200_OK, summary="List installed packages")
async def list_packages(request: Request, language: str = "python"):
    """Returns a list of all currently installed packages for the given runtime language."""
    token = auth_service.get_bearer_token(request.headers.get("Authorization"))
    try:
        if not auth_service.validate_token(token):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    except ValueError as ex:
        logger.error(str(ex))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Sandbox auth is not configured.")

    packages = await package_manager_service.list_packages(language)
    return {"language": language, "packages": packages}


@router.get("/support", response_model=PackageSupportResponse, status_code=status.HTTP_200_OK, summary="Check package manager support")
async def get_package_support(language: str = ""):
    """Returns whether the package manager supports the selected execution language."""
    return package_manager_service.resolve_package_language(language)


@router.post("/install", response_model=PackageInstallResponse, status_code=status.HTTP_200_OK, summary="Install dynamic package")
async def install_package(request: Request, body: PackageInstallRequest):
    """Installs a package (e.g. via pip / npm) into the sandbox runtime environment dynamically."""
    token = auth_service.get_bearer_token(request.headers.get("Authorization"))
    try:
        if not auth_service.validate_token(token):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    except ValueError as ex:
        logger.error(str(ex))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Sandbox auth is not configured.")

    return await package_manager_service.install_package(body)


@router.post("/uninstall", response_model=PackageInstallResponse, status_code=status.HTTP_200_OK, summary="Uninstall package")
async def uninstall_package(request: Request, body: PackageInstallRequest):
    """Uninstalls a package from the sandbox environment."""
    token = auth_service.get_bearer_token(request.headers.get("Authorization"))
    try:
        if not auth_service.validate_token(token):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    except ValueError as ex:
        logger.error(str(ex))
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Sandbox auth is not configured.")

    return await package_manager_service.uninstall_package(body)
