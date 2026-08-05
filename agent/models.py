from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

CompletenessLevel = Literal["complete", "partial", "incomplete"]
CorrectnessLevel = Literal[
    "correct",
    "mostly_correct",
    "partially_correct",
    "incorrect",
    "uncertain",
]
Grade = Literal["A", "B", "C", "D", "F"]


class AssignmentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=500)
    question: str = Field(min_length=1, max_length=50_000)
    instructions: str | None = Field(default=None, max_length=50_000)


class SubmissionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student: str = Field(min_length=1, max_length=200)
    answer: str = Field(min_length=1, max_length=200_000)


class EvaluationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assignment: AssignmentInput
    submission: SubmissionInput
    rubric: str | None = Field(default=None, max_length=50_000)


class DimensionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    level: str = Field(min_length=1)
    comment: str = Field(min_length=1, max_length=20_000)


class CompletenessResult(DimensionResult):
    level: CompletenessLevel


class CorrectnessResult(DimensionResult):
    level: CorrectnessLevel


class EvaluationReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    completeness: CompletenessResult
    correctness: CorrectnessResult
    main_problems: list[str] = Field(min_length=1, max_length=50)
    suggestions: list[str] = Field(min_length=1, max_length=50)
    score: int = Field(ge=0, le=100)
    grade: Grade

    @field_validator("main_problems", "suggestions")
    @classmethod
    def clean_list(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values if value.strip()]
        if not cleaned:
            raise ValueError("At least one non-empty item is required.")
        if any(len(value) > 20_000 for value in cleaned):
            raise ValueError("Feedback items must not exceed 20000 characters.")
        return cleaned


class EvaluationUsage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    total_tokens: int = Field(ge=0)
    estimated_cost_usd: float = Field(ge=0)


class EvaluationObservability(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model_name: str = Field(min_length=1, max_length=200)
    prompt_version: str = Field(min_length=1, max_length=100)
    duration_ms: float = Field(ge=0)
    usage: EvaluationUsage


class EvaluationResponse(EvaluationReport):
    provider: Literal["mock", "deepseek"]
    attempts: int = Field(ge=1, le=2)
    raw_output: str = Field(max_length=200_000)
    observability: EvaluationObservability
