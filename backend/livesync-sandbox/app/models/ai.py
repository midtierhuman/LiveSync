from pydantic import BaseModel, ConfigDict, Field


class AiAnalysisRequest(BaseModel):
    model_config = ConfigDict(alias_generator=None, populate_by_name=True)

    action: str = Field(default="explain") # explain, refactor, generate-tests, suggest
    language: str = Field(default="python")
    code: str


class AiAnalysisResponse(BaseModel):
    model_config = ConfigDict(alias_generator=None, populate_by_name=True)

    action: str
    language: str
    explanation: str
    suggestions: list[str]
    generated_code: str | None = None
