from app.models.execution import ExecutionLanguageDescriptor
from app.services.executors.base import BaseExecutor
from app.services.executors.python_executor import PythonExecutor
from app.services.executors.node_executor import NodeExecutor


class ExecutionCatalog:
    ALIASES: dict[str, str] = {
        "py": "python",
        "python3": "python",
        "js": "javascript",
        "node": "javascript",
        "nodejs": "javascript",
        "ts": "javascript",
        "typescript": "javascript",
    }

    def __init__(self) -> None:
        self._executors: dict[str, BaseExecutor] = {}
        self.register_executor(PythonExecutor())
        self.register_executor(NodeExecutor())

    def register_executor(self, executor: BaseExecutor) -> None:
        self._executors[executor.language_name.lower()] = executor

    def get_languages(self) -> list[ExecutionLanguageDescriptor]:
        return [
            ExecutionLanguageDescriptor(
                name=exec.language_name,
                display_name=exec.display_name
            )
            for exec in self._executors.values()
        ]

    def normalize_language(self, language: str) -> str:
        lang = language.strip().lower()
        return self.ALIASES.get(lang, lang)

    def get_executor(self, language: str) -> BaseExecutor | None:
        normalized = self.normalize_language(language)
        return self._executors.get(normalized)


catalog = ExecutionCatalog()
