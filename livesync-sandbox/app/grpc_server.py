import asyncio
import logging
import os
import queue
import shutil
import subprocess
import tempfile
import threading
import time

from app.models.execution import SandboxExecutionRequest
from app.pb import sandbox_pb2, sandbox_pb2_grpc
from app.services.ai_assistant import ai_assistant_service
from app.services.executor_service import executor_service
from app.services.package_manager import package_manager_service
from app.utils.env_sanitizer import get_sanitized_env

logger = logging.getLogger(__name__)


class SandboxServiceServicer(sandbox_pb2_grpc.SandboxServiceServicer):

    def ExecuteCode(self, request, context):
        lang = request.language or "python"
        code = request.code
        stdin = request.standard_input or None
        timeout_ms = request.timeout_ms if request.timeout_ms > 0 else 15000

        exec_req = SandboxExecutionRequest(
            language=lang,
            code=code,
            standard_input=stdin,
            timeout_ms=timeout_ms
        )

        res = asyncio.run(executor_service.execute(exec_req))

        exit_code = res.exit_code if res.exit_code is not None else (0 if res.is_success else 1)
        duration_ms = int(res.execution_duration_ms or 0)

        return sandbox_pb2.ExecutionResponse(
            language=res.language or lang,
            status=res.status or ("Completed" if res.is_success else "Error"),
            is_success=res.is_success,
            message=res.message or "",
            exit_code=exit_code,
            stdout=res.standard_output or "",
            stderr=res.standard_error or "",
            execution_time_ms=duration_ms
        )

    def StreamExecution(self, request_iterator, context):
        """
        Bi-directional streaming RPC for interactive stateful process execution.
        The process is spawned ONCE and stays alive in memory for the whole lifecycle.
        Stdin entries are piped directly to the live running process.
        """
        try:
            first_req = next(request_iterator)
        except StopIteration:
            return

        lang = (first_req.language or "python").lower()
        code = first_req.code

        temp_dir = tempfile.mkdtemp(prefix="livesync_pty_")
        file_name = "script.py" if lang in ("python", "py") else ("script.js" if lang in ("node", "javascript", "js") else "Main.java")
        file_path = os.path.join(temp_dir, file_name)

        try:
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(code)

            exec_cmd = ["python", "-u", file_path] if lang in ("python", "py") else ["node", file_path]
            env = get_sanitized_env()
            env["PYTHONUNBUFFERED"] = "1"

            process = subprocess.Popen(
                exec_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=temp_dir,
                env=env,
                bufsize=0
            )

            out_queue = queue.Queue()

            def read_stdout():
                while True:
                    data = process.stdout.read(1024)
                    if not data:
                        break
                    out_queue.put(("stdout", data.decode("utf-8", errors="replace")))

            def read_stderr():
                while True:
                    data = process.stderr.read(1024)
                    if not data:
                        break
                    out_queue.put(("stderr", data.decode("utf-8", errors="replace")))

            t1 = threading.Thread(target=read_stdout, daemon=True)
            t2 = threading.Thread(target=read_stderr, daemon=True)
            t1.start()
            t2.start()

            def read_requests():
                try:
                    for req in request_iterator:
                        if req.action == "kill":
                            try:
                                process.kill()
                            except Exception:
                                pass
                            break
                        elif req.standard_input:
                            stdin_bytes = req.standard_input.encode("utf-8")
                            # Echo input to client stdout so terminal displays typed input
                            out_queue.put(("stdout", req.standard_input))
                            if process.poll() is None and process.stdin:
                                try:
                                    process.stdin.write(stdin_bytes)
                                    process.stdin.flush()
                                except Exception:
                                    pass
                except Exception as e:
                    logger.warning(f"Error in request_iterator: {e}")

            req_thread = threading.Thread(target=read_requests, daemon=True)
            req_thread.start()

            # Handle initial stdin if provided in first_req
            if first_req.standard_input:
                stdin_bytes = first_req.standard_input.encode("utf-8")
                out_queue.put(("stdout", first_req.standard_input))
                if process.poll() is None and process.stdin:
                    try:
                        process.stdin.write(stdin_bytes)
                        process.stdin.flush()
                    except Exception:
                        pass

            while process.poll() is None or not out_queue.empty():
                try:
                    stream_type, content = out_queue.get(timeout=0.1)
                    yield sandbox_pb2.ExecutionChunk(stream_type=stream_type, content=content)
                except queue.Empty:
                    continue

            process.wait()
            t1.join(timeout=1.0)
            t2.join(timeout=1.0)

            while not out_queue.empty():
                stream_type, content = out_queue.get_nowait()
                yield sandbox_pb2.ExecutionChunk(stream_type=stream_type, content=content)

            exit_code = process.returncode if process.returncode is not None else 0
            yield sandbox_pb2.ExecutionChunk(
                stream_type="exit",
                exit_code=exit_code,
                status="Finished" if exit_code == 0 else f"Failed (exit {exit_code})"
            )

        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)

    def GetLanguages(self, request, context):
        langs = executor_service.get_languages()
        descriptors = [
            sandbox_pb2.LanguageDescriptor(name=l.name, display_name=l.display_name)
            for l in langs
        ]
        return sandbox_pb2.LanguagesResponse(languages=descriptors)

    def AnalyzeCode(self, request, context):
        res = ai_assistant_service.analyze(
            action=request.action,
            language=request.language,
            code=request.code,
            custom_prompt=request.prompt if request.prompt else None,
            model=request.model if request.model else None
        )
        return sandbox_pb2.AiAnalysisResponse(
            action=res.action,
            language=res.language,
            explanation=res.explanation,
            suggestions=res.suggestions,
            generated_code=res.generated_code or "",
            provider=res.provider
        )

    def SearchPackages(self, request, context):
        query = request.query
        mgr = request.package_manager or "python"
        lang = "python" if mgr in ("pypi", "python") else ("javascript" if mgr in ("npm", "javascript") else mgr)
        items = asyncio.run(package_manager_service.search_packages(query=query, language=lang))
        pb_items = [
            sandbox_pb2.PackageItem(
                name=i.get("name", ""),
                version=i.get("version", "latest"),
                description=i.get("description", "")
            )
            for i in items
        ]
        return sandbox_pb2.PackageSearchResponse(query=query, packages=pb_items)


def serve_grpc(port: int = 50051):
    import grpc
    from concurrent import futures
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    sandbox_pb2_grpc.add_SandboxServiceServicer_to_server(SandboxServiceServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info(f"gRPC Server listening on port {port}")
    return server
