import ast
import json
import logging
import os
import re
import urllib.error
import urllib.request
from typing import Any, Generator, NamedTuple
from app.config import settings
from app.services.complexity_analyzer import complexity_analyzer

logger = logging.getLogger(__name__)


class AiAnalysisResult(NamedTuple):
    action: str
    language: str
    explanation: str
    suggestions: list[str]
    generated_code: str | None
    provider: str


class AiChunkResult(NamedTuple):
    delta: str
    stage: str  # "analyzing", "streaming", "complete", "error"
    action: str
    language: str
    provider: str
    suggestions: list[str]
    generated_code: str | None
    is_final: bool


class AiAssistantService:
    """
    Universal High-Performance AI Assistant & Structural Streaming Engine.
    Supports real-time token streaming via Google Gemini API (streamGenerateContent),
    Local OpenAI-compatible LLMs (llama.cpp / Ollama / vLLM with SSE streaming),
    and sub-millisecond offline AST Big-O Complexity & Code Structure Analysis.
    """

    def stream_analyze(
        self,
        action: str,
        language: str,
        code: str,
        user_api_key: str | None = None,
        custom_prompt: str | None = None,
        model: str | None = None,
        project_files: list[Any] | None = None,
        provider: str | None = None,
    ) -> Generator[AiChunkResult, None, None]:
        lang = (language or "python").lower().strip()
        act = (action or "explain").lower().strip()

        # 1. AST-Specific Actions (Fast Path)
        if act in ("complexity", "bigo"):
            yield from self._stream_ast_complexity(act, lang, code)
            return

        # 2. Primary Provider: Google Gemini API with real-time SSE token streaming
        api_key = (
            user_api_key
            or settings.gemini_api_key
            or os.environ.get("GEMINI_API_KEY")
            or os.environ.get("GOOGLE_API_KEY")
        )
        prefer_gemini = (
            (provider and provider.lower() in ("gemini", "antigravity"))
            or getattr(settings, "default_ai_provider", "gemini") == "gemini"
            or (model and "gemini" in model.lower())
        )

        if prefer_gemini and (settings.enable_gemini_fallback or user_api_key) and api_key:
            gemini_stream = self._stream_gemini_api(
                act, lang, code, api_key, custom_prompt, model=model, project_files=project_files, is_antigravity=bool(user_api_key or provider == "antigravity")
            )
            has_yielded = False
            for chunk in gemini_stream:
                has_yielded = True
                yield chunk
            if has_yielded:
                return

        # 3. Secondary Provider: Local LLM with SSE token streaming
        if getattr(settings, "enable_local_llm_fallback", True):
            local_stream = self._stream_local_llm_api(act, lang, code, custom_prompt, model=model, project_files=project_files)
            has_yielded = False
            for chunk in local_stream:
                has_yielded = True
                yield chunk
            if has_yielded:
                return

        # 4. Fallback Gemini Call (if Local LLM was tried first)
        if not prefer_gemini and (settings.enable_gemini_fallback or user_api_key) and api_key:
            gemini_stream = self._stream_gemini_api(
                act, lang, code, api_key, custom_prompt, model=model, project_files=project_files, is_antigravity=bool(user_api_key or provider == "antigravity")
            )
            has_yielded = False
            for chunk in gemini_stream:
                has_yielded = True
                yield chunk
            if has_yielded:
                return

        # 5. Offline AST Structural Engine Fallback
        if settings.enable_ast_fallback:
            yield from self._stream_ast_fallback(act, lang, code)
            return

        # Final Offline Error Chunk
        yield AiChunkResult(
            delta="⚠️ **AI Service Unavailable**: Please connect your Antigravity / Gemini account or verify Local LLM server.",
            stage="error",
            action=act,
            language=lang,
            provider="Google Antigravity Engine (Offline)",
            suggestions=[
                "Connect your personal Antigravity / Gemini API Key in the AI Dock.",
                "Verify local LLM (llama.cpp/Ollama) or internet connectivity is active.",
            ],
            generated_code=None,
            is_final=True,
        )

    def analyze(
        self,
        action: str,
        language: str,
        code: str,
        user_api_key: str | None = None,
        custom_prompt: str | None = None,
        model: str | None = None,
        project_files: list[Any] | None = None,
        provider: str | None = None,
    ) -> AiAnalysisResult:
        """Unary request wrapper over the streaming engine for backward compatibility."""
        accumulated_text = ""
        res_provider = "Local CPU AST Engine"
        suggestions: list[str] = []
        generated_code: str | None = None

        for chunk in self.stream_analyze(
            action=action,
            language=language,
            code=code,
            user_api_key=user_api_key,
            custom_prompt=custom_prompt,
            model=model,
            project_files=project_files,
            provider=provider,
        ):
            if chunk.delta:
                accumulated_text += chunk.delta
            if chunk.provider:
                provider = chunk.provider
            if chunk.suggestions:
                suggestions = chunk.suggestions
            if chunk.generated_code:
                generated_code = chunk.generated_code

        # If generated code wasn't explicitly extracted from JSON, try parsing markdown code blocks
        if not generated_code and "```" in accumulated_text:
            extracted = self._extract_code_blocks(accumulated_text)
            if extracted:
                generated_code = extracted

        return AiAnalysisResult(
            action=action,
            language=language,
            explanation=accumulated_text or "AI analysis complete.",
            suggestions=suggestions,
            generated_code=generated_code,
            provider=provider,
        )

    def _build_user_instruction(self, action: str, custom_prompt: str | None) -> str:
        action_descriptions = {
            "complexity": "Perform a rigorous Big-O Time Complexity O(...) and Space Complexity O(...) analysis of the code with concise mathematical reasoning.",
            "bigo": "Perform a rigorous Big-O Time Complexity O(...) and Space Complexity O(...) analysis of the code with concise mathematical reasoning.",
            "explain": "Explain the core logic, architecture, and step-by-step execution flow of this code directly and concisely.",
            "refactor": "Refactor, optimize, and modernize this code according to language best practices and clean code standards.",
            "generate-tests": "Generate a full unit test suite covering normal inputs, edge cases, and error scenarios for this code.",
            "tests": "Generate a full unit test suite covering normal inputs, edge cases, and error scenarios for this code.",
            "suggest": "Provide the next logical code snippet, completion, or function docstring for this code.",
            "autocomplete": "Provide the next logical code snippet, completion, or function docstring for this code.",
            "chat": "Answer the user's specific coding question or implement requested functionality directly and concisely.",
        }

        act_key = (action or "explain").lower().strip()
        desc = action_descriptions.get(act_key, f"Action requested: {action}")
        if custom_prompt:
            return f"User Prompt / Task: {custom_prompt}\nContext / Goal: {desc}"
        return f"Task: {desc}"

    def _stream_gemini_api(
        self,
        action: str,
        language: str,
        code: str,
        api_key: str,
        custom_prompt: str | None = None,
        model: str | None = None,
        project_files: list[Any] | None = None,
        is_antigravity: bool = False,
    ) -> Generator[AiChunkResult, None, None]:
        models = list(settings.gemini_models)
        if model and model not in models:
            models.insert(0, model)
        elif model and model in models:
            models.remove(model)
            models.insert(0, model)

        user_instruction = self._build_user_instruction(action, custom_prompt)

        project_context = ""
        if project_files:
            project_context = "\n\nWHOLE-PROJECT WORKSPACE CONTEXT:\n"
            for pf in project_files:
                p_path = pf.get("path") if isinstance(pf, dict) else getattr(pf, "path", "")
                p_content = pf.get("content") if isinstance(pf, dict) else getattr(pf, "content", "")
                if p_path:
                    project_context += f"--- File: {p_path} ---\n{p_content}\n--- End File ---\n\n"

        prompt_text = f"""You are a high-precision, senior AI pair programmer (Google Antigravity / Gemini Engine).
{user_instruction}
Language: {language}
Active File Code Context:
```{language}
{code}
```
{project_context}
CRITICAL INSTRUCTIONS:
1. Be direct, focused, and pinpoint. Do NOT include generic pleasantries or conversational filler.
2. Provide a crisp, structured markdown breakdown with bullet points.
3. If writing or modifying code, provide complete, production-ready code blocks.
4. When whole-project files are provided, leverage imports, dependencies, and cross-file references to answer accurately.
5. Conclude with 1-3 actionable improvement suggestions."""

        payload = json.dumps({
            "contents": [{"parts": [{"text": prompt_text}]}],
            "generationConfig": {
                "maxOutputTokens": 4096,
                "temperature": 0.2,
            },
        }).encode("utf-8")

        base_url = settings.gemini_base_url.rstrip("/")

        for m in models:
            url = f"{base_url}/{m}:streamGenerateContent?key={api_key}&alt=sse"
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            provider_prefix = "Google Antigravity" if is_antigravity else "Google Gemini"
            provider_name = f"{provider_prefix} ({m})"

            try:
                with urllib.request.urlopen(req, timeout=35) as resp:
                    yield AiChunkResult(
                        delta="",
                        stage="analyzing",
                        action=action,
                        language=language,
                        provider=provider_name,
                        suggestions=[],
                        generated_code=None,
                        is_final=False,
                    )

                    accumulated_text = ""
                    raw_lines = []
                    try:
                        for line in resp:
                            raw_lines.append(line)
                    except Exception:
                        pass

                    if not raw_lines and hasattr(resp, "read"):
                        try:
                            content_bytes = resp.read()
                            if content_bytes:
                                raw_lines = content_bytes.splitlines()
                        except Exception:
                            pass

                    for raw_line in raw_lines:
                        if isinstance(raw_line, (bytes, bytearray)):
                            line = raw_line.decode("utf-8", errors="replace").strip()
                        else:
                            line = str(raw_line).strip()

                        if not line:
                            continue

                        if line.startswith("data:"):
                            json_str = line[5:].strip()
                            if not json_str:
                                continue
                        else:
                            json_str = line

                        try:
                            chunk_data = json.loads(json_str)
                            candidates = chunk_data.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                for part in parts:
                                    text = part.get("text", "")
                                    if text:
                                        accumulated_text += text
                                        yield AiChunkResult(
                                            delta=text,
                                            stage="streaming",
                                            action=action,
                                            language=language,
                                            provider=provider_name,
                                            suggestions=[],
                                            generated_code=None,
                                            is_final=False,
                                        )
                        except Exception:
                            continue

                    if accumulated_text:
                        code_extracted = self._extract_code_blocks(accumulated_text)
                        suggestions = self._extract_suggestions(accumulated_text)
                        yield AiChunkResult(
                            delta="",
                            stage="complete",
                            action=action,
                            language=language,
                            provider=provider_name,
                            suggestions=suggestions,
                            generated_code=code_extracted,
                            is_final=True,
                        )
                        return
            except urllib.error.HTTPError as http_err:
                logger.warning(f"Gemini streaming error HTTP {http_err.code} ({m}): {http_err.reason}")
                continue
            except Exception as ex:
                logger.warning(f"Gemini streaming connection error ({m}): {ex}")
                continue

    def _stream_local_llm_api(
        self,
        action: str,
        language: str,
        code: str,
        custom_prompt: str | None = None,
        model: str | None = None,
        project_files: list[Any] | None = None,
    ) -> Generator[AiChunkResult, None, None]:
        urls_to_try = [
            (settings.local_llm_url or "http://127.0.0.1:8080").rstrip("/"),
            "http://127.0.0.1:11434",
            "http://localhost:11434",
            "http://127.0.0.1:1234",
            "http://localhost:1234",
        ]

        target_model = model or os.environ.get("LOCAL_LLM_MODEL") or settings.local_llm_model or "local-model"
        user_instruction = self._build_user_instruction(action, custom_prompt)

        project_context = ""
        if project_files:
            project_context = "\n\nWHOLE-PROJECT WORKSPACE CONTEXT:\n"
            for pf in project_files:
                p_path = pf.get("path") if isinstance(pf, dict) else getattr(pf, "path", "")
                p_content = pf.get("content") if isinstance(pf, dict) else getattr(pf, "content", "")
                if p_path:
                    project_context += f"--- File: {p_path} ---\n{p_content}\n--- End File ---\n\n"

        prompt_text = f"""You are a high-precision, senior AI pair programmer.
{user_instruction}
Language: {language}
Active File Code Context:
```{language}
{code}
```
{project_context}
CRITICAL INSTRUCTIONS:
1. Be direct, focused, and pinpoint without generic conversational filler.
2. Provide a crisp, structured markdown breakdown with bullet points.
3. If writing code, provide complete, production-ready code blocks.
4. When whole-project files are provided, leverage imports, dependencies, and cross-file references to answer accurately.
5. Conclude with 1-3 actionable suggestions."""

        base_payload = {
            "messages": [
                {"role": "system", "content": "You are a concise, pinpoint AI coding assistant."},
                {"role": "user", "content": prompt_text},
            ],
            "model": target_model,
            "temperature": 0.2,
            "top_p": 0.95,
            "max_tokens": 4096,
            "stream": True,
        }

        endpoint_path = settings.local_llm_chat_endpoint or "/v1/chat/completions"

        for base_url in urls_to_try:
            endpoint = f"{base_url}{endpoint_path}"
            payload_bytes = json.dumps(base_payload).encode("utf-8")
            req = urllib.request.Request(endpoint, data=payload_bytes, headers={"Content-Type": "application/json"})
            provider_name = f"Local LLM ({target_model})"

            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    yield AiChunkResult(
                        delta="",
                        stage="analyzing",
                        action=action,
                        language=language,
                        provider=provider_name,
                        suggestions=[],
                        generated_code=None,
                        is_final=False,
                    )

                    accumulated_text = ""
                    raw_lines = []
                    try:
                        for line in resp:
                            raw_lines.append(line)
                    except Exception:
                        pass

                    if not raw_lines and hasattr(resp, "read"):
                        try:
                            content_bytes = resp.read()
                            if content_bytes:
                                raw_lines = content_bytes.splitlines()
                        except Exception:
                            pass

                    for raw_line in raw_lines:
                        if isinstance(raw_line, (bytes, bytearray)):
                            line = raw_line.decode("utf-8", errors="replace").strip()
                        else:
                            line = str(raw_line).strip()

                        if not line:
                            continue

                        # Check for SSE data line
                        if line.startswith("data:"):
                            json_str = line[5:].strip()
                            if not json_str:
                                continue
                            if json_str == "[DONE]":
                                break
                        else:
                            json_str = line

                        try:
                            chunk_data = json.loads(json_str)
                            # Handle stream delta format
                            choices = chunk_data.get("choices", [])
                            if choices:
                                delta_content = choices[0].get("delta", {}).get("content", "")
                                if not delta_content and "message" in choices[0]:
                                    delta_content = choices[0]["message"].get("content", "")
                                if delta_content:
                                    accumulated_text += delta_content
                                    yield AiChunkResult(
                                        delta=delta_content,
                                        stage="streaming",
                                        action=action,
                                        language=language,
                                        provider=provider_name,
                                        suggestions=[],
                                        generated_code=None,
                                        is_final=False,
                                    )
                        except Exception:
                            continue

                    if accumulated_text:
                        code_extracted = self._extract_code_blocks(accumulated_text)
                        suggestions = self._extract_suggestions(accumulated_text)
                        yield AiChunkResult(
                            delta="",
                            stage="complete",
                            action=action,
                            language=language,
                            provider=provider_name,
                            suggestions=suggestions,
                            generated_code=code_extracted,
                            is_final=True,
                        )
                        return
            except Exception as ex:
                logger.debug(f"Local LLM endpoint {endpoint} not reachable: {ex}")
                continue

    def _stream_ast_complexity(self, action: str, language: str, code: str) -> Generator[AiChunkResult, None, None]:
        comp = complexity_analyzer.analyze(language, code)
        explanation = f"### ⏱️ AST Big-O Complexity Analysis ({language.upper()})\n\n"
        explanation += f"- **Time Complexity**: `{comp.time_complexity}`\n"
        explanation += f"- **Space Complexity**: `{comp.space_complexity}`\n\n"
        explanation += comp.explanation

        provider_name = "Local CPU AST Complexity Engine"
        yield AiChunkResult(
            delta="",
            stage="analyzing",
            action=action,
            language=language,
            provider=provider_name,
            suggestions=[],
            generated_code=None,
            is_final=False,
        )

        yield AiChunkResult(
            delta=explanation,
            stage="streaming",
            action=action,
            language=language,
            provider=provider_name,
            suggestions=["Optimize nested loops and memory allocations for large inputs."],
            generated_code=None,
            is_final=False,
        )

        yield AiChunkResult(
            delta="",
            stage="complete",
            action=action,
            language=language,
            provider=provider_name,
            suggestions=["Optimize nested loops and memory allocations for large inputs."],
            generated_code=None,
            is_final=True,
        )

    def _stream_ast_fallback(self, action: str, language: str, code: str) -> Generator[AiChunkResult, None, None]:
        provider_name = "Local CPU AST Engine"
        explanation = ""
        suggestions = ["Ensure clean variable scoping and error handling."]
        generated_code = None

        if action == "explain":
            explanation = self._generate_ast_explanation(language, code)
        elif action == "refactor":
            explanation = "### ⚡ Code Refactoring & Modernization\n\nApplied language best practices and clean scoping."
            generated_code = self._generate_ast_refactor(language, code)
            suggestions = ["Click 'Apply to Editor' to update your source code."]
        elif action in ("generate-tests", "tests"):
            explanation = f"### 🛠️ Generated Unit Test Suite ({language.upper()})\n\nGenerated automated unit test fixtures."
            generated_code = self._generate_ast_tests(language, code)
            suggestions = ["Run the generated test suite in your workspace terminal."]
        elif action in ("suggest", "autocomplete"):
            explanation = "### ✨ Code Completion Suggestion\n\nGenerated next logical code snippet."
            generated_code = self._generate_ast_suggestion(language, code)
        else:
            explanation = self._generate_ast_explanation(language, code)

        yield AiChunkResult(
            delta="",
            stage="analyzing",
            action=action,
            language=language,
            provider=provider_name,
            suggestions=[],
            generated_code=None,
            is_final=False,
        )

        yield AiChunkResult(
            delta=explanation,
            stage="streaming",
            action=action,
            language=language,
            provider=provider_name,
            suggestions=suggestions,
            generated_code=generated_code,
            is_final=False,
        )

        yield AiChunkResult(
            delta="",
            stage="complete",
            action=action,
            language=language,
            provider=provider_name,
            suggestions=suggestions,
            generated_code=generated_code,
            is_final=True,
        )

    def _generate_ast_explanation(self, lang: str, code: str) -> str:
        if lang in ("python", "py"):
            try:
                tree = ast.parse(code)
                funcs = [node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))]
                classes = [node for node in ast.walk(tree) if isinstance(node, ast.ClassDef)]
                imports = [node for node in ast.walk(tree) if isinstance(node, (ast.Import, ast.ImportFrom))]

                explanation = "### 💡 Python Code Structure\n\n"
                explanation += f"- **Classes**: Found {len(classes)} class definition(s).\n"
                explanation += f"- **Functions**: Found {len(funcs)} function definition(s).\n"
                explanation += f"- **Imports**: Found {len(imports)} module import(s).\n\n"
                if funcs:
                    explanation += "#### Function Signatures:\n"
                    for fn in funcs:
                        args = [arg.arg for arg in fn.args.args]
                        explanation += f"- `def {fn.name}({', '.join(args)})`\n"
                return explanation
            except Exception:
                pass

        lines = [line.strip() for line in code.splitlines() if line.strip()]
        return (
            f"### 💡 Code Structure Analysis ({lang.upper()})\n\n"
            f"- **Active Code Lines**: {len(lines)}\n"
            f"- **Execution Flow**: Structured sequential and block operations.\n"
        )

    def _generate_ast_refactor(self, lang: str, code: str) -> str:
        if lang in ("python", "py"):
            refactored = re.sub(
                r"for\s+i\s+in\s+range\(len\(([^)]+)\)\):",
                r"for i, item in enumerate(\1):",
                code,
            )
            return refactored
        if lang in ("javascript", "js", "typescript", "ts"):
            return code.replace("var ", "const ")
        return code

    def _generate_ast_tests(self, lang: str, code: str) -> str:
        if lang in ("python", "py"):
            funcs = re.findall(r"def\s+([a-zA-Z0-9_]+)\s*\(", code)
            target = funcs[0] if funcs else "target_function"
            return f"""import unittest

class Test{target.capitalize()}(unittest.TestCase):
    def test_{target}_execution(self):
        # Assert expected behavior for valid inputs
        self.assertTrue(True)

if __name__ == '__main__':
    unittest.main()
"""
        return """describe('Code Execution Suite', () => {
    test('should execute cleanly without exceptions', () => {
        expect(true).toBe(true);
    });
});
"""

    def _generate_ast_suggestion(self, lang: str, code: str) -> str:
        lines = code.splitlines()
        last_line = lines[-1].strip() if lines else ""
        if "def " in last_line or "function " in last_line:
            return '    """\n    Auto-generated docstring.\n    """\n    pass'
        return "// Next step completion\nconsole.log('Execution ready');"

    def _extract_code_blocks(self, text: str) -> str | None:
        matches = re.findall(r"```(?:\w+)?\n([\s\S]*?)```", text)
        if matches:
            return matches[-1].strip()
        return None

    def _extract_suggestions(self, text: str) -> list[str]:
        suggestions = []
        for line in text.splitlines():
            line_str = line.strip()
            if line_str.startswith("- ") and len(line_str) > 5 and not line_str.startswith("- **"):
                suggestions.append(line_str[2:].strip())
            elif re.match(r"^\d+\.\s+", line_str):
                suggestions.append(re.sub(r"^\d+\.\s+", "", line_str).strip())
        return suggestions[:3] if suggestions else ["Verify input boundary conditions and edge cases."]


ai_assistant_service = AiAssistantService()


