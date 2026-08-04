from abc import ABC, abstractmethod
from app.models.execution import SandboxExecutionRequest, SandboxExecutionResponse


class BaseExecutor(ABC):
    @property
    @abstractmethod
    def language_name(self) -> str:
        """Returns the canonical language name, e.g. 'python'"""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Returns the human-readable display name, e.g. 'Python 3'"""
        pass

    @abstractmethod
    async def execute(self, request: SandboxExecutionRequest) -> SandboxExecutionResponse:
        """Executes the code snippet safely within process/timeout boundaries."""
        pass
