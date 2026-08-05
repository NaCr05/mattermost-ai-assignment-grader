import json
import logging
from dataclasses import dataclass
from threading import Lock

from models import EvaluationResponse

logger = logging.getLogger("tide.agent")


def log_event(event: str, **fields: object) -> None:
    logger.info(json.dumps({"event": event, **fields}, ensure_ascii=False))


@dataclass
class ProviderMetrics:
    requests: int = 0
    successes: int = 0
    failures: int = 0
    duration_seconds: float = 0.0
    attempts: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost_usd: float = 0.0


class AgentMetrics:
    def __init__(self) -> None:
        self._lock = Lock()
        self._providers: dict[str, ProviderMetrics] = {}

    def _provider(self, provider: str) -> ProviderMetrics:
        return self._providers.setdefault(provider, ProviderMetrics())

    def record_success(self, result: EvaluationResponse) -> None:
        with self._lock:
            metrics = self._provider(result.provider)
            metrics.requests += 1
            metrics.successes += 1
            metrics.duration_seconds += result.observability.duration_ms / 1000
            metrics.attempts += result.attempts
            metrics.input_tokens += result.observability.usage.input_tokens
            metrics.output_tokens += result.observability.usage.output_tokens
            metrics.estimated_cost_usd += (
                result.observability.usage.estimated_cost_usd
            )

    def record_failure(self, provider: str, duration_seconds: float) -> None:
        with self._lock:
            metrics = self._provider(provider)
            metrics.requests += 1
            metrics.failures += 1
            metrics.duration_seconds += duration_seconds

    def snapshot(self) -> dict[str, ProviderMetrics]:
        with self._lock:
            return {
                provider: ProviderMetrics(**vars(metrics))
                for provider, metrics in self._providers.items()
            }

    def render_prometheus(self) -> str:
        snapshot = self.snapshot()
        lines = [
            "# HELP tide_agent_evaluations_total Evaluation requests by outcome.",
            "# TYPE tide_agent_evaluations_total counter",
        ]
        for provider, metrics in sorted(snapshot.items()):
            labels = f'provider="{provider}"'
            lines.append(
                f'tide_agent_evaluations_total{{{labels},outcome="success"}} {metrics.successes}'
            )
            lines.append(
                f'tide_agent_evaluations_total{{{labels},outcome="failure"}} {metrics.failures}'
            )

        lines.extend(
            [
                "# HELP tide_agent_evaluation_duration_seconds_total Total evaluation time.",
                "# TYPE tide_agent_evaluation_duration_seconds_total counter",
                *[
                    f'tide_agent_evaluation_duration_seconds_total{{provider="{provider}"}} {metrics.duration_seconds:.6f}'
                    for provider, metrics in sorted(snapshot.items())
                ],
                "# HELP tide_agent_provider_attempts_total Provider attempts for successful evaluations.",
                "# TYPE tide_agent_provider_attempts_total counter",
                *[
                    f'tide_agent_provider_attempts_total{{provider="{provider}"}} {metrics.attempts}'
                    for provider, metrics in sorted(snapshot.items())
                ],
                "# HELP tide_agent_tokens_total Model tokens reported by the provider.",
                "# TYPE tide_agent_tokens_total counter",
            ]
        )
        for provider, metrics in sorted(snapshot.items()):
            lines.append(
                f'tide_agent_tokens_total{{provider="{provider}",direction="input"}} {metrics.input_tokens}'
            )
            lines.append(
                f'tide_agent_tokens_total{{provider="{provider}",direction="output"}} {metrics.output_tokens}'
            )
        lines.extend(
            [
                "# HELP tide_agent_estimated_cost_usd_total Configured estimated provider cost.",
                "# TYPE tide_agent_estimated_cost_usd_total counter",
                *[
                    f'tide_agent_estimated_cost_usd_total{{provider="{provider}"}} {metrics.estimated_cost_usd:.8f}'
                    for provider, metrics in sorted(snapshot.items())
                ],
            ]
        )
        return "\n".join(lines) + "\n"
