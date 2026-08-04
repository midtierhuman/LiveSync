from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class AiAnalysisRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    action: str = Field(default="explain")  # explain, refactor, generate-tests, suggest, chat
    language: str = Field(default="python")
    code: str
    prompt: str | None = None


class AiAnalysisResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    action: str
    language: str
    explanation: str
    suggestions: list[str]
    generated_code: str | None = None

