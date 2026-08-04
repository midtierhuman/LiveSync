import asyncio
import json
import logging
import os
import shutil
import sys
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class PackageInstallRequest(BaseModel):
    language: str
    package_name: str


class PackageInstallResponse(BaseModel):
    success: bool
    language: str
    package_name: str
    message: str
    output: str


class PackageManagerService:
    def _get_python_executable(self) -> str:
        python_exec = sys.executable
        if "WindowsApps" in python_exec or not os.path.exists(python_exec):
            real_py = shutil.which("py") or shutil.which("python3") or shutil.which("python")
            if real_py:
                python_exec = real_py
        return python_exec

    async def list_packages(self, language: str) -> list[dict[str, str]]:
        lang = (language or "python").lower().strip()
        packages = []

        if lang in ("python", "py"):
            py_exec = self._get_python_executable()
            try:
                proc = await asyncio.create_subprocess_exec(
                    py_exec,
                    "-m",
                    "pip",
                    "list",
                    "--format=json",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10.0)
                if proc.returncode == 0 and stdout:
                    data = json.loads(stdout.decode("utf-8", errors="replace"))
                    for item in data:
                        packages.append({"name": item.get("name"), "version": item.get("version")})
            except Exception as ex:
                logger.error(f"Error listing Python packages: {ex}")

        return packages

    async def install_package(self, request: PackageInstallRequest) -> PackageInstallResponse:
        lang = (request.language or "python").lower().strip()
        package_name = (request.package_name or "").strip()

        if not package_name:
            return PackageInstallResponse(
                success=False,
                language=lang,
                package_name="",
                message="Package name is required.",
                output="",
            )

        # Sanitize package name (prevent command injection)
        clean_package_name = "".join(c for c in package_name if c.isalnum() or c in ("-", "_", ".", "[", "]", "=", ">", "<", "@", "/"))

        if lang in ("python", "py"):
            py_exec = self._get_python_executable()
            cmd = [py_exec, "-m", "pip", "install", clean_package_name]
        elif lang in ("javascript", "js", "node"):
            npm_exec = shutil.which("npm") or "npm"
            cmd = [npm_exec, "install", "--no-save", clean_package_name]
        else:
            return PackageInstallResponse(
                success=False,
                language=lang,
                package_name=clean_package_name,
                message=f"Package installation for '{lang}' is not currently supported.",
                output="",
            )

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=300.0)
            stdout_str = stdout_bytes.decode("utf-8", errors="replace")
            stderr_str = stderr_bytes.decode("utf-8", errors="replace")
            full_output = stdout_str + ("\n--- STDERR ---\n" + stderr_str if stderr_str.strip() else "")

            if proc.returncode == 0:
                return PackageInstallResponse(
                    success=True,
                    language=lang,
                    package_name=clean_package_name,
                    message=f"Successfully installed '{clean_package_name}' for {lang}.",
                    output=full_output,
                )
            else:
                return PackageInstallResponse(
                    success=False,
                    language=lang,
                    package_name=clean_package_name,
                    message=f"Failed to install '{clean_package_name}'. Exit code: {proc.returncode}.",
                    output=full_output,
                )
        except asyncio.TimeoutError:
            return PackageInstallResponse(
                success=False,
                language=lang,
                package_name=clean_package_name,
                message="Package installation timed out.",
                output="Installation timed out after 300 seconds.",
            )
        except Exception as ex:
            return PackageInstallResponse(
                success=False,
                language=lang,
                package_name=clean_package_name,
                message=f"Error installing package: {str(ex)}",
                output=str(ex),
            )


package_manager_service = PackageManagerService()
