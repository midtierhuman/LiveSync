import asyncio
import os
import sys
import tempfile
from datetime import datetime, timezone
from app.models.execution import SandboxExecutionRequest, SandboxExecutionResponse
from app.services.executors.base import BaseExecutor


class PythonExecutor(BaseExecutor):
    @property
    def language_name(self) -> str:
        return "python"

    @property
    def display_name(self) -> str:
        return "Python 3"

    async def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResponse:
        requested_at = datetime.now(timezone.utc)
        timeout_seconds = request.timeout_ms / 1000.0

        temp_dir = tempfile.mkdtemp(prefix="livesync_py_")
        file_path = os.path.join(temp_dir, "script.py")

        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(request.code)

            python_executable = sys.executable

            process = await asyncio.create_subprocess_exec(
                python_executable,
                file_path,
                stdin=asyncio.subprocess.PIPE if request.standard_input else None,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdin_data = request.standard_input.encode("utf-8") if request.standard_input else None

            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(input=stdin_data),
                    timeout=timeout_seconds,
                )
                completed_at = datetime.now(timezone.utc)

                stdout_str = stdout_bytes.decode("utf-8", errors="replace")
                stderr_str = stderr_bytes.decode("utf-8", errors="replace")
                exit_code = process.returncode

                is_success = (exit_code == 0)
                status = "Success" if is_success else "Failed"
                message = "Execution completed successfully." if is_success else f"Process exited with code {exit_code}."

                return SandboxExecutionResponse(
                    language=self.language_name,
                    status=status,
                    is_success=is_success,
                    message=message,
                    standard_output=stdout_str,
                    standard_error=stderr_str,
                    exit_code=exit_code,
                    requested_at=requested_at,
                    completed_at=completed_at,
                )

            except asyncio.TimeoutError:
                completed_at = datetime.now(timezone.utc)
                try:
                    process.kill()
                    await process.wait()
                except Exception:
                    pass

                return SandboxExecutionResponse(
                    language=self.language_name,
                    status="TimedOut",
                    is_success=False,
                    message=f"Execution timed out after {request.timeout_ms}ms.",
                    standard_output="",
                    standard_error=f"Timeout limit of {request.timeout_ms}ms exceeded.",
                    exit_code=-1,
                    requested_at=requested_at,
                    completed_at=completed_at,
                )

        except Exception as ex:
            completed_at = datetime.now(timezone.utc)
            return SandboxExecutionResponse(
                language=self.language_name,
                status="Error",
                is_success=False,
                message=f"System execution error: {str(ex)}",
                standard_output="",
                standard_error=str(ex),
                exit_code=-1,
                requested_at=requested_at,
                completed_at=completed_at,
            )

        finally:
            # Clean up temp file & dir
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                if os.path.exists(temp_dir):
                    os.rmdir(temp_dir)
            except Exception:
                pass
