import asyncio
import os
import shutil
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


from app.services.csharp_warmup import csharp_warmup_service


class CSharpExecutor(BaseExecutor):
    @property
    def language_name(self) -> str:
        return "csharp"

    @property
    def display_name(self) -> str:
        return "C# (.NET)"

    async def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResponse:
        ACTIVE_EXECUTIONS_GAUGE.inc()
        requested_at = datetime.now(timezone.utc)
        start_ns = time.perf_counter_ns()
        timeout_seconds = request.timeout_ms / 1000.0

        complexity = complexity_analyzer.analyze("csharp", request.code)

        dotnet_path = shutil.which("dotnet")
        if not dotnet_path:
            ACTIVE_EXECUTIONS_GAUGE.dec()
            EXECUTION_COUNTER.labels(language=self.language_name, status="Rejected").inc()
            return SandboxExecutionResponse(
                language=self.language_name,
                status="Rejected",
                is_success=False,
                message=".NET SDK is not available on host system.",
                time_complexity=complexity.time_complexity,
                space_complexity=complexity.space_complexity,
                complexity_explanation=complexity.explanation,
                requested_at=requested_at,
                completed_at=datetime.now(timezone.utc),
            )

        temp_dir = tempfile.mkdtemp(prefix="livesync_cs_")
        csharp_warmup_service.prepare_csharp_dir(temp_dir)
        file_path = os.path.join(temp_dir, "Program.cs")

        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(request.code)

            process = await asyncio.create_subprocess_exec(
                dotnet_path,
                "run",
                "--project",
                temp_dir,
                "--no-restore",
                "--nologo",
                stdin=asyncio.subprocess.PIPE if request.standard_input else None,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )


            stdin_data = request.standard_input.encode("utf-8") if request.standard_input else None

            try:
                peak_mem_bytes, cpu_time_ms = get_process_metrics(process.pid)

                stdout_bytes, stderr_bytes = await asyncio.wait_for(
                    process.communicate(input=stdin_data),
                    timeout=timeout_seconds,
                )
                completed_at = datetime.now(timezone.utc)
                duration_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000.0, 2)

                stdout_str = stdout_bytes.decode("utf-8", errors="replace")
                stderr_str = stderr_bytes.decode("utf-8", errors="replace")
                exit_code = process.returncode

                is_success = (exit_code == 0)
                status = "Success" if is_success else "Failed"
                message = "Execution completed successfully." if is_success else f"Process exited with code {exit_code}."

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
                    peak_memory_bytes=1024 * 1024,
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
                shutil.rmtree(temp_dir, ignore_errors=True)
            except Exception:
                pass
