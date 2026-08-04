import os
import shutil
import subprocess
import tempfile
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class CSharpWarmupService:
    def __init__(self):
        self._warm_dir: Optional[str] = None
        self._target_framework: str = "net8.0"
        self._initialized: bool = False

    def detect_target_framework(self) -> str:
        try:
            dotnet_path = shutil.which("dotnet")
            if dotnet_path:
                output = subprocess.check_output([dotnet_path, "--version"], text=True, timeout=5).strip()
                major = output.split(".")[0]
                if major.isdigit():
                    return f"net{major}.0"
        except Exception as e:
            logger.warning(f"Failed to detect dotnet version: {e}")
        return "net8.0"

    def initialize(self):
        if self._initialized and self._warm_dir and os.path.exists(self._warm_dir):
            return

        dotnet_path = shutil.which("dotnet")
        if not dotnet_path:
            logger.warning("Dotnet SDK not found on system. Skipping C# warmup.")
            return

        try:
            self._target_framework = self.detect_target_framework()
            base_temp = tempfile.gettempdir()
            self._warm_dir = os.path.join(base_temp, "livesync_cs_warm_template")
            os.makedirs(self._warm_dir, exist_ok=True)

            proj_path = os.path.join(self._warm_dir, "SandboxApp.csproj")
            cs_proj_content = f"""<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>{self._target_framework}</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>"""
            with open(proj_path, "w", encoding="utf-8") as f:
                f.write(cs_proj_content)

            dummy_program = os.path.join(self._warm_dir, "Program.cs")
            with open(dummy_program, "w", encoding="utf-8") as f:
                f.write('System.Console.WriteLine("Warmup");')

            logger.info(f"Initializing & pre-restoring C# warm template ({self._target_framework})...")
            subprocess.run([dotnet_path, "restore", self._warm_dir], capture_output=True, timeout=30)
            subprocess.run([dotnet_path, "build", "--no-restore", self._warm_dir], capture_output=True, timeout=30)

            self._initialized = True
            logger.info("C# warm template initialization complete.")
        except Exception as e:
            logger.error(f"Error during C# warmup initialization: {e}")

    def prepare_csharp_dir(self, target_dir: str):
        self.initialize()
        proj_path = os.path.join(target_dir, "SandboxApp.csproj")
        cs_proj_content = f"""<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>{self._target_framework}</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>"""
        with open(proj_path, "w", encoding="utf-8") as f:
            f.write(cs_proj_content)

        if self._warm_dir and os.path.exists(os.path.join(self._warm_dir, "obj")):
            try:
                shutil.copytree(
                    os.path.join(self._warm_dir, "obj"),
                    os.path.join(target_dir, "obj"),
                    dirs_exist_ok=True,
                )
            except Exception as e:
                logger.warning(f"Could not copy obj cache from warm template: {e}")


csharp_warmup_service = CSharpWarmupService()
