import asyncio
import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone
from app.models.execution import SandboxExecutionRequest, SandboxExecutionResponse
from app.services.executors.base import BaseExecutor
from app.services.complexity_analyzer import complexity_analyzer
from app.services.metrics import (
    EXECUTION_COUNTER,
    EXECUTION_DURATION_HISTOGRAM,
    EXECUTION_MEMORY_HISTOGRAM,
    ACTIVE_EXECUTIONS_GAUGE,
    get_process_metrics,
)


class PythonExecutor(BaseExecutor):
    @property
    def language_name(self) -> str:
        return "python"

    @property
    def display_name(self) -> str:
        return "Python 3"

    async def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResponse:
        ACTIVE_EXECUTIONS_GAUGE.inc()
        requested_at = datetime.now(timezone.utc)
        start_ns = time.perf_counter_ns()
        timeout_seconds = request.timeout_ms / 1000.0

        # Perform complexity analysis on input code
        complexity = complexity_analyzer.analyze("python", request.code)

        temp_dir = tempfile.mkdtemp(prefix="livesync_py_")
        file_path = os.path.join(temp_dir, "script.py")

        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(request.code)

            python_executable = sys.executable
            if "WindowsApps" in python_executable or not os.path.exists(python_executable):
                real_py = shutil.which("py") or shutil.which("python3") or shutil.which("python")
                if real_py:
                    python_executable = real_py


            from app.utils.env_sanitizer import get_sanitized_env

            process = await asyncio.create_subprocess_exec(
                python_executable,
                file_path,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=get_sanitized_env(),
            )

            stdin_data = request.standard_input.encode("utf-8") if request.standard_input else b""

            try:
                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(input=stdin_data),
                    timeout=timeout_seconds,
                )
                peak_mem_bytes, cpu_time_ms = get_process_metrics(process.pid)
                completed_at = datetime.now(timezone.utc)
                duration_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000.0, 2)

                stdout_str = stdout_bytes.decode("utf-8", errors="replace")
                stderr_str = stderr_bytes.decode("utf-8", errors="replace")
                exit_code = process.returncode

                is_success = (exit_code == 0)
                status = "Success" if is_success else "Failed"
                if is_success:
                    message = "Execution completed successfully."
                elif "EOFError: EOF when reading a line" in stderr_str:
                    is_success = True
                    status = "Completed"
                    exit_code = 0
                    message = "Process paused expecting user input (input()). Provide inputs in standardInput or use the Live Terminal."
                    # Remove noisy traceback lines from stderr for clean UX
                    stderr_str = "[Note] Process reached input() prompt and completed available stdin buffer."
                else:
                    message = f"Process exited with code {exit_code}."


                # Prometheus metrics
                EXECUTION_COUNTER.labels(language=self.language_name, status=status).inc()
                EXECUTION_DURATION_HISTOGRAM.labels(language=self.language_name).observe(duration_ms / 1000.0)
                EXECUTION_MEMORY_HISTOGRAM.labels(language=self.language_name).observe(peak_mem_bytes)

                return SandboxExecutionResponse(
                    language=self.language_name,
                    status=status,
                    is_success=is_success,
                    message=message,
                    standard_output=stdout_str,
                    standard_error=stderr_str,
                    exit_code=exit_code,
                    execution_duration_ms=duration_ms,
                    peak_memory_bytes=peak_mem_bytes,
                    cpu_time_ms=round(cpu_time_ms, 2),
                    time_complexity=complexity.time_complexity,
                    space_complexity=complexity.space_complexity,
                    complexity_explanation=complexity.explanation,
                    requested_at=requested_at,
                    completed_at=completed_at,
                )

            except asyncio.TimeoutError:
                completed_at = datetime.now(timezone.utc)
                duration_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000.0, 2)
                try:
                    process.kill()
                    await process.wait()
                except Exception:
                    pass

                EXECUTION_COUNTER.labels(language=self.language_name, status="TimedOut").inc()

                return SandboxExecutionResponse(
                    language=self.language_name,
                    status="TimedOut",
                    is_success=False,
                    message=f"Execution timed out after {request.timeout_ms}ms.",
                    standard_output="",
                    standard_error=f"Timeout limit of {request.timeout_ms}ms exceeded.",
                    exit_code=-1,
                    execution_duration_ms=duration_ms,
                    peak_memory_bytes=0,
                    cpu_time_ms=0.0,
                    time_complexity=complexity.time_complexity,
                    space_complexity=complexity.space_complexity,
                    complexity_explanation=complexity.explanation,
                    requested_at=requested_at,
                    completed_at=completed_at,
                )

        except Exception as ex:
            completed_at = datetime.now(timezone.utc)
            duration_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000.0, 2)
            EXECUTION_COUNTER.labels(language=self.language_name, status="Error").inc()

            return SandboxExecutionResponse(
                language=self.language_name,
                status="Error",
                is_success=False,
                message=f"System execution error: {str(ex)}",
                standard_output="",
                standard_error=str(ex),
                exit_code=-1,
                execution_duration_ms=duration_ms,
                peak_memory_bytes=0,
                cpu_time_ms=0.0,
                time_complexity=complexity.time_complexity,
                space_complexity=complexity.space_complexity,
                complexity_explanation=complexity.explanation,
                requested_at=requested_at,
                completed_at=completed_at,
            )

        finally:
            ACTIVE_EXECUTIONS_GAUGE.dec()
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                if os.path.exists(temp_dir):
                    os.rmdir(temp_dir)
            except Exception:
                pass
