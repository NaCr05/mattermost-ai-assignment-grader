from time import perf_counter

from models import EvaluationRequest, EvaluationResponse
from provider_port import EvaluationProvider
from providers import DeepSeekEvaluationProvider, MockEvaluationProvider


class EvaluationModule:
    def __init__(self, provider: EvaluationProvider, mode: str | None = None) -> None:
        self._provider = provider
        self._mode = mode or ("live" if provider.name == "deepseek" else "mock")

    @property
    def mode(self) -> str:
        return self._mode

    def evaluate(self, request: EvaluationRequest) -> EvaluationResponse:
        started_at = perf_counter()
        result = self._provider.evaluate(request)
        return EvaluationResponse(
            **result.report.model_dump(),
            provider=result.provider,
            attempts=result.attempts,
            raw_output=result.raw_output,
            observability={
                "model_name": result.model_name,
                "prompt_version": result.prompt_version,
                "duration_ms": round((perf_counter() - started_at) * 1000, 2),
                "usage": {
                    "input_tokens": result.usage.input_tokens,
                    "output_tokens": result.usage.output_tokens,
                    "total_tokens": result.usage.total_tokens,
                    "estimated_cost_usd": result.usage.estimated_cost_usd,
                },
            },
        )


def create_evaluation_module(mode: str) -> EvaluationModule:
    normalized_mode = mode.lower()
    if normalized_mode == "mock":
        return EvaluationModule(MockEvaluationProvider.from_environment(), mode="mock")
    if normalized_mode == "live":
        return EvaluationModule(
            DeepSeekEvaluationProvider.from_environment(),
            mode="live",
        )
    raise ValueError("AGENT_MODE must be mock or live.")
