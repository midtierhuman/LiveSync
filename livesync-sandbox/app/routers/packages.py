import logging
from fastapi import APIRouter, HTTPException, Request, status
from app.services.package_manager import (
    PackageInstallRequest,
    PackageInstallResponse,
    package_manager_service,
)
from app.services.auth_service import auth_service

router = APIRouter(prefix="/api/packages", tags=["Packages"])
logger = logging.getLogger(__name__)


@router.get("/list", status_code=status.HTTP_200_OK, summary="List installed packages")
async def list_packages(language: str = "python"):
    """Returns a list of all currently installed packages for the given runtime language."""
    packages = await package_manager_service.list_packages(language)
    return {"language": language, "packages": packages}


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
