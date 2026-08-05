from dataclasses import dataclass, field
from typing import Literal, Protocol

from models import EvaluationReport, EvaluationRequest


@dataclass(frozen=True)
class ProviderUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: float = 0.0


@dataclass(frozen=True)
class ProviderResult:
    report: EvaluationReport
    raw_output: str
    attempts: int
    provider: Literal["mock", "deepseek"]
    model_name: str = "unknown"
    prompt_version: str = "unknown"
    usage: ProviderUsage = field(default_factory=ProviderUsage)


class EvaluationProvider(Protocol):
    name: Literal["mock", "deepseek"]

    def evaluate(self, request: EvaluationRequest) -> ProviderResult: ...
