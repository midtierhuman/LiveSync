import asyncio
import json
import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone
from fastapi import WebSocket, WebSocketDisconnect
from app.services.complexity_analyzer import complexity_analyzer
from app.services.metrics import (
    EXECUTION_COUNTER,
    EXECUTION_DURATION_HISTOGRAM,
    EXECUTION_MEMORY_HISTOGRAM,
    ACTIVE_EXECUTIONS_GAUGE,
    get_process_metrics,
)


class StreamingExecutorService:
    async def handle_websocket_session(self, websocket: WebSocket):
        await websocket.accept()
        ACTIVE_EXECUTIONS_GAUGE.inc()
        start_ns = time.perf_counter_ns()
        temp_dir = None
        process = None

        try:
            # Wait for initial configuration message
            raw_init = await websocket.receive_text()
            init_data = json.loads(raw_init)

            action = init_data.get("action", "")
            if action != "start":
                await websocket.send_json({
                    "type": "error",
                    "message": "First message must specify action='start'.",
                })
                await websocket.close()
                return

            language = (init_data.get("language") or "").lower().strip()
            code = init_data.get("code") or ""
            timeout_ms = int(init_data.get("timeoutMs") or 120000)
            timeout_seconds = timeout_ms / 1000.0

            # Analyze Big-O Complexity
            complexity = complexity_analyzer.analyze(language, code)

            # Determine executable path & create temporary file
            executable, file_name, command_args = self._resolve_execution_cmd(language)
            if not executable:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Runtime environment for '{language}' is not available.",
                })
                await websocket.close()
                return

            temp_dir = tempfile.mkdtemp(prefix=f"livesync_stream_{language}_")
            if language in ("csharp", "cs"):
                from app.services.csharp_warmup import csharp_warmup_service
                csharp_warmup_service.prepare_csharp_dir(temp_dir)

            script_path = os.path.join(temp_dir, file_name)

            with open(script_path, "w", encoding="utf-8") as f:
                f.write(code)

            # Insert target file into command args if applicable
            full_cmd = [executable] + [arg.format(file=script_path, dir=temp_dir) for arg in command_args]


            # Spawn interactive subprocess
            process = await asyncio.create_subprocess_exec(
                *full_cmd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            # Send session started confirmation
            await websocket.send_json({
                "type": "status",
                "status": "Running",
                "language": language,
                "timeComplexity": complexity.time_complexity,
                "spaceComplexity": complexity.space_complexity,
                "complexityExplanation": complexity.explanation,
            })

            # Stream reader helper for stdout / stderr
            async def read_stream(stream, stream_type: str):
                try:
                    while True:
                        chunk = await stream.read(512)
                        if not chunk:
                            break
                        text = chunk.decode("utf-8", errors="replace")
                        await websocket.send_json({"type": stream_type, "data": text})
                except Exception:
                    pass

            stdout_task = asyncio.create_task(read_stream(process.stdout, "stdout"))
            stderr_task = asyncio.create_task(read_stream(process.stderr, "stderr"))

            # Listen for client stdin input & control messages
            async def listen_client_input():
                try:
                    while True:
                        msg_text = await websocket.receive_text()
                        msg = json.loads(msg_text)
                        msg_action = msg.get("action")

                        if msg_action == "stdin":
                            stdin_data = msg.get("data", "")
                            if process and process.stdin and not process.stdin.is_closing():
                                process.stdin.write(stdin_data.encode("utf-8"))
                                await process.stdin.drain()
                        elif msg_action == "kill":
                            if process:
                                process.kill()
                            break
                except WebSocketDisconnect:
                    if process:
                        process.kill()
                except Exception:
                    pass

            input_task = asyncio.create_task(listen_client_input())

            # Wait for process exit or timeout
            try:
                peak_mem_bytes, cpu_time_ms = get_process_metrics(process.pid)
                await asyncio.wait_for(process.wait(), timeout=timeout_seconds)
            except asyncio.TimeoutError:
                if process:
                    process.kill()
                    await process.wait()
                await websocket.send_json({
                    "type": "stderr",
                    "data": f"\n[Execution Timed Out after {timeout_ms}ms]\n",
                })

            input_task.cancel()
            await asyncio.gather(stdout_task, stderr_task, return_exceptions=True)

            completed_at = datetime.now(timezone.utc)
            duration_ms = round((time.perf_counter_ns() - start_ns) / 1_000_000.0, 2)
            exit_code = process.returncode if process else -1
            is_success = (exit_code == 0)
            status = "Success" if is_success else "Failed"

            # Record Prometheus Metrics
            EXECUTION_COUNTER.labels(language=language, status=status).inc()
            EXECUTION_DURATION_HISTOGRAM.labels(language=language).observe(duration_ms / 1000.0)
            EXECUTION_MEMORY_HISTOGRAM.labels(language=language).observe(peak_mem_bytes)

            # Send final exit payload with full resource metrics
            await websocket.send_json({
                "type": "exit",
                "exitCode": exit_code,
                "status": status,
                "isSuccess": is_success,
                "executionDurationMs": duration_ms,
                "peakMemoryBytes": peak_mem_bytes,
                "cpuTimeMs": round(cpu_time_ms, 2),
                "timeComplexity": complexity.time_complexity,
                "spaceComplexity": complexity.space_complexity,
                "complexityExplanation": complexity.explanation,
                "completedAt": completed_at.isoformat(),
            })

        except WebSocketDisconnect:
            pass
        except Exception as ex:
            try:
                await websocket.send_json({"type": "error", "message": str(ex)})
            except Exception:
                pass
        finally:
            ACTIVE_EXECUTIONS_GAUGE.dec()
            if process and process.returncode is None:
                try:
                    process.kill()
                except Exception:
                    pass
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except Exception:
                    pass
            try:
                await websocket.close()
            except Exception:
                pass

    def _resolve_execution_cmd(self, language: str) -> tuple[str | None, str, list[str]]:
        if language in ("python", "py"):
            return sys.executable, "script.py", ["-u", "{file}"]
        elif language in ("javascript", "js", "node"):
            node_path = shutil.which("node")
            return node_path, "script.js", ["{file}"]
        elif language in ("csharp", "cs"):
            dotnet_path = shutil.which("dotnet")
            return dotnet_path, "Program.cs", ["run", "--project", "{dir}", "--no-restore", "--nologo"]
        elif language in ("java",):
            java_path = shutil.which("java")
            return java_path, "Main.java", ["{file}"]

        return None, "", []


streaming_executor_service = StreamingExecutorService()
