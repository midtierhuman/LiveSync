from datetime import datetime, timezone
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ExecutionLanguageDescriptor(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: str
    display_name: str


class SandboxExecutionRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    language: str
    code: str = ""
    standard_input: str | None = Field(default=None)
    timeout_ms: int = Field(default=15000, ge=1, le=120000)
    files: dict[str, str] = Field(default_factory=dict)
    entrypoint: str | None = None


class SandboxExecutionResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    language: str
    status: str
    is_success: bool
    message: str
    standard_output: str | None = None
    standard_error: str | None = None
    exit_code: int | None = None
    execution_duration_ms: float | None = None
    peak_memory_bytes: int | None = None
    cpu_time_ms: float | None = None
    time_complexity: str | None = None
    space_complexity: str | None = None
    complexity_explanation: str | None = None
    requested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
