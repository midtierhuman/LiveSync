import asyncio
import json
import logging
import os
import shutil
import sys
import urllib.request
import urllib.parse
from pydantic import BaseModel

logger = logging.getLogger(__name__)

POPULAR_PYTHON_PACKAGES = [
    {"name": "transformers", "description": "State-of-the-art Machine Learning for PyTorch, TensorFlow, and JAX", "category": "AI / ML"},
    {"name": "torch", "description": "Tensors and Dynamic neural networks in Python with strong GPU acceleration", "category": "AI / ML"},
    {"name": "torchvision", "description": "Datasets, Transforms, and Models specific to Computer Vision", "category": "AI / ML"},
    {"name": "torchaudio", "description": "Data manipulation and audio processing for PyTorch", "category": "AI / ML"},
    {"name": "numpy", "description": "Fundamental package for array computing with Python", "category": "Data Science"},
    {"name": "pandas", "description": "Powerful data structures for data analysis, time series, and statistics", "category": "Data Science"},
    {"name": "scipy", "description": "Fundamental algorithms for scientific computing in Python", "category": "Data Science"},
    {"name": "matplotlib", "description": "Comprehensive library for creating static, animated, and interactive visualizations", "category": "Data Science"},
    {"name": "seaborn", "description": "Statistical data visualization based on matplotlib", "category": "Data Science"},
    {"name": "scikit-learn", "description": "Machine learning and data mining in Python", "category": "AI / ML"},
    {"name": "requests", "description": "Elegant and simple HTTP library for Python, built for human beings", "category": "Web / API"},
    {"name": "fastapi", "description": "High performance, easy to learn, fast to code, ready for production web framework", "category": "Web / API"},
    {"name": "flask", "description": "A simple and lightweight WSGI web application framework", "category": "Web / API"},
    {"name": "uvicorn", "description": "An ASGI web server implementation for Python", "category": "Web / API"},
    {"name": "beautifulsoup4", "description": "Screen-scraping library designed for quick turnaround projects", "category": "Utilities"},
    {"name": "pillow", "description": "Python Imaging Library (PIL) fork for image processing", "category": "Utilities"},
    {"name": "pydantic", "description": "Data validation and settings management using Python type hints", "category": "Utilities"},
    {"name": "pytest", "description": "Simple and powerful testing framework for Python", "category": "DevTools"},
    {"name": "black", "description": "The uncompromising Python code formatter", "category": "DevTools"},
    {"name": "httpx", "description": "A fully featured HTTP client for Python 3 with async support", "category": "Web / API"},
]

POPULAR_JS_PACKAGES = [
    {"name": "lodash", "description": "Lodash modular utilities for arrays, numbers, objects, and strings", "category": "Utilities"},
    {"name": "axios", "description": "Promise based HTTP client for the browser and node.js", "category": "Web / API"},
    {"name": "express", "description": "Fast, unopinionated, minimalist web framework for node", "category": "Web / API"},
    {"name": "rxjs", "description": "Reactive Extensions Library for JavaScript", "category": "Utilities"},
    {"name": "moment", "description": "Parse, validate, manipulate, and display dates in javascript", "category": "Utilities"},
    {"name": "dayjs", "description": "Fast 2kB alternative to Moment.js with the same modern API", "category": "Utilities"},
    {"name": "uuid", "description": "RFC4122 UUID generator for JavaScript", "category": "Utilities"},
    {"name": "three", "description": "JavaScript 3D Library for WebGL", "category": "Graphics"},
    {"name": "chart.js", "description": "Simple HTML5 Charts using the canvas tag", "category": "Graphics"},
    {"name": "dotenv", "description": "Loads environment variables from .env file", "category": "Utilities"},
]


class PackageInstallRequest(BaseModel):
    language: str
    package_name: str


class PackageInstallResponse(BaseModel):
    success: bool
    language: str
    package_name: str
    message: str
    output: str


class PackageSupportResponse(BaseModel):
    requested_language: str
    supported: bool
    package_language: str | None = None
    package_display_name: str | None = None
    message: str


class PackageManagerService:
    SUPPORTED_LANGUAGE_ALIASES: dict[str, str] = {
        "python": "python",
        "py": "python",
        "javascript": "javascript",
        "js": "javascript",
        "node": "javascript",
        "nodejs": "javascript",
        "typescript": "javascript",
        "ts": "javascript",
    }

    PACKAGE_LANGUAGE_LABELS: dict[str, str] = {
        "python": "Python / pip",
        "javascript": "Node.js / npm",
    }

    def _get_python_executable(self) -> str:
        python_exec = sys.executable
        if "WindowsApps" in python_exec or not os.path.exists(python_exec):
            real_py = shutil.which("py") or shutil.which("python3") or shutil.which("python")
            if real_py:
                python_exec = real_py
        return python_exec

    def resolve_package_language(self, language: str) -> PackageSupportResponse:
        requested_language = (language or "").strip()
        normalized = requested_language.lower()
        package_language = self.SUPPORTED_LANGUAGE_ALIASES.get(normalized)

        if package_language:
            return PackageSupportResponse(
                requested_language=requested_language,
                supported=True,
                package_language=package_language,
                package_display_name=self.PACKAGE_LANGUAGE_LABELS[package_language],
                message=self.PACKAGE_LANGUAGE_LABELS[package_language],
            )

        display_name = requested_language or "this language"
        return PackageSupportResponse(
            requested_language=requested_language,
            supported=False,
            package_language=None,
            package_display_name=None,
            message=f"Package manager not available for {display_name}.",
        )

    async def get_popular_packages(self, language: str) -> list[dict[str, str]]:
        support = self.resolve_package_language(language)
        if support.package_language == "python":
            return POPULAR_PYTHON_PACKAGES
        elif support.package_language == "javascript":
            return POPULAR_JS_PACKAGES
        return []

    async def search_packages(self, query: str, language: str) -> list[dict[str, str]]:
        q = (query or "").strip().lower()
        if not q:
            return await self.get_popular_packages(language)

        support = self.resolve_package_language(language)
        loop = asyncio.get_running_loop()

        if support.package_language == "python":
            return await loop.run_in_executor(None, self._search_pypi_sync, q)
        elif support.package_language == "javascript":
            return await loop.run_in_executor(None, self._search_npm_sync, q)

        return []

    def _search_pypi_sync(self, query: str) -> list[dict[str, str]]:
        results = []
        # Filter popular packages first
        for pkg in POPULAR_PYTHON_PACKAGES:
            if query in pkg["name"].lower() or query in pkg["description"].lower():
                results.append(pkg)

        # Try querying PyPI JSON API directly for exact or partial package matches
        try:
            url = f"https://pypi.org/pypi/{urllib.parse.quote(query)}/json"
            req = urllib.request.Request(url, headers={"User-Agent": "LiveSync-Sandbox/1.0"})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    info = data.get("info", {})
                    exact_name = info.get("name", query)
                    if not any(r["name"].lower() == exact_name.lower() for r in results):
                        results.insert(0, {
                            "name": exact_name,
                            "description": info.get("summary", "Python package from PyPI"),
                            "version": info.get("version", ""),
                            "category": "PyPI",
                        })
        except Exception:
            pass

        # If query is not in popular and PyPI exact match wasn't found, add query as candidate
        if not results:
            results.append({
                "name": query,
                "description": f"Custom package candidate '{query}' from PyPI",
                "version": "latest",
                "category": "PyPI",
            })

        return results[:15]

    def _search_npm_sync(self, query: str) -> list[dict[str, str]]:
        results = []
        for pkg in POPULAR_JS_PACKAGES:
            if query in pkg["name"].lower() or query in pkg["description"].lower():
                results.append(pkg)

        try:
            url = f"https://registry.npmjs.org/-/v1/search?text={urllib.parse.quote(query)}&size=10"
            req = urllib.request.Request(url, headers={"User-Agent": "LiveSync-Sandbox/1.0"})
            with urllib.request.urlopen(req, timeout=2.5) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode("utf-8"))
                    objects = data.get("objects", [])
                    for obj in objects:
                        pkg_info = obj.get("package", {})
                        name = pkg_info.get("name")
                        if name and not any(r["name"].lower() == name.lower() for r in results):
                            results.append({
                                "name": name,
                                "description": pkg_info.get("description", "npm package"),
                                "version": pkg_info.get("version", ""),
                                "category": "npm",
                            })
        except Exception:
            pass

        if not results:
            results.append({
                "name": query,
                "description": f"Custom package candidate '{query}' from npm",
                "version": "latest",
                "category": "npm",
            })

        return results[:15]

    async def list_packages(self, language: str) -> list[dict[str, str]]:
        support = self.resolve_package_language(language)
        packages = []

        if support.package_language == "python":
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
        elif support.package_language == "javascript":
            npm_exec = shutil.which("npm") or "npm"
            try:
                proc = await asyncio.create_subprocess_exec(
                    npm_exec,
                    "list",
                    "--json",
                    "--depth=0",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10.0)
                if proc.returncode == 0 and stdout:
                    data = json.loads(stdout.decode("utf-8", errors="replace"))
                    dependencies = data.get("dependencies", {}) or {}
                    for name, meta in dependencies.items():
                        version = meta.get("version", "") if isinstance(meta, dict) else ""
                        packages.append({"name": name, "version": version})
            except Exception as ex:
                logger.error(f"Error listing JavaScript packages: {ex}")

        return packages

    async def install_package(self, request: PackageInstallRequest) -> PackageInstallResponse:
        support = self.resolve_package_language(request.language)
        lang = support.package_language or (request.language or "").lower().strip()
        package_name = (request.package_name or "").strip()

        if not package_name:
            return PackageInstallResponse(
                success=False,
                language=lang,
                package_name="",
                message="Package name is required.",
                output="",
            )

        if support.package_language == "javascript":
            allowed = set("-_./@^~=><")
        else:
            allowed = set("-_.[]=><!~,:")

        clean_package_name = "".join(c for c in package_name if c.isalnum() or c in allowed)

        if clean_package_name != package_name:
            return PackageInstallResponse(
                success=False,
                language=lang,
                package_name=package_name,
                message="Invalid package name or specifier.",
                output="",
            )

        if support.package_language == "python":
            py_exec = self._get_python_executable()
            cmd = [py_exec, "-m", "pip", "install", clean_package_name]
        elif support.package_language == "javascript":
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
                    message=f"Successfully installed '{clean_package_name}'.",
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

    async def uninstall_package(self, request: PackageInstallRequest) -> PackageInstallResponse:
        support = self.resolve_package_language(request.language)
        lang = support.package_language or (request.language or "").lower().strip()
        package_name = (request.package_name or "").strip()

        if not package_name:
            return PackageInstallResponse(
                success=False,
                language=lang,
                package_name="",
                message="Package name is required.",
                output="",
            )

        if support.package_language == "javascript":
            allowed = set("-_./@")
        else:
            allowed = set("-_.[]")

        clean_package_name = "".join(c for c in package_name if c.isalnum() or c in allowed)

        if clean_package_name != package_name:
            return PackageInstallResponse(
                success=False,
                language=lang,
                package_name=package_name,
                message="Invalid package name or specifier.",
                output="",
            )

        if support.package_language == "python":
            py_exec = self._get_python_executable()
            cmd = [py_exec, "-m", "pip", "uninstall", "-y", clean_package_name]
        elif support.package_language == "javascript":
            npm_exec = shutil.which("npm") or "npm"
            cmd = [npm_exec, "uninstall", clean_package_name]
        else:
            return PackageInstallResponse(
                success=False,
                language=lang,
                package_name=clean_package_name,
                message=f"Uninstall for '{lang}' is not supported.",
                output="",
            )

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout_bytes, stderr_bytes = await asyncio.wait_for(proc.communicate(), timeout=60.0)
            stdout_str = stdout_bytes.decode("utf-8", errors="replace")
            stderr_str = stderr_bytes.decode("utf-8", errors="replace")
            full_output = stdout_str + ("\n" + stderr_str if stderr_str.strip() else "")

            if proc.returncode == 0:
                return PackageInstallResponse(
                    success=True,
                    language=lang,
                    package_name=clean_package_name,
                    message=f"Successfully uninstalled '{clean_package_name}'.",
                    output=full_output,
                )
            else:
                return PackageInstallResponse(
                    success=False,
                    language=lang,
                    package_name=clean_package_name,
                    message=f"Uninstall returned exit code {proc.returncode}.",
                    output=full_output,
                )
        except Exception as ex:
            return PackageInstallResponse(
                success=False,
                language=lang,
                package_name=clean_package_name,
                message=f"Error uninstalling package: {str(ex)}",
                output=str(ex),
            )


package_manager_service = PackageManagerService()
