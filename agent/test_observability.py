import unittest

from evaluation_module import EvaluationModule
from models import EvaluationReport, EvaluationRequest
from observability import AgentMetrics
from provider_port import ProviderResult, ProviderUsage


class ObservableProvider:
    name = "deepseek"

    def evaluate(self, _request: EvaluationRequest) -> ProviderResult:
        return ProviderResult(
            report=EvaluationReport(
                completeness={"level": "complete", "comment": "Complete."},
                correctness={"level": "correct", "comment": "Correct."},
                main_problems=["None."],
                suggestions=["Continue."],
                score=92,
                grade="A",
            ),
            raw_output="internal output",
            attempts=2,
            provider="deepseek",
            model_name="test-model",
            prompt_version="test-prompt-v1",
            usage=ProviderUsage(
                input_tokens=120,
                output_tokens=30,
                total_tokens=150,
                estimated_cost_usd=0.0012,
            ),
        )


class ObservabilityTests(unittest.TestCase):
    def test_metrics_expose_only_aggregate_provider_data(self) -> None:
        request = EvaluationRequest(
            assignment={"title": "Stacks", "question": "Explain LIFO."},
            submission={"student": "Student", "answer": "Last in, first out."},
        )
        result = EvaluationModule(ObservableProvider()).evaluate(request)
        metrics = AgentMetrics()
        metrics.record_success(result)
        rendered = metrics.render_prometheus()

        self.assertIn('provider="deepseek",outcome="success"} 1', rendered)
        self.assertIn('direction="input"} 120', rendered)
        self.assertIn("0.00120000", rendered)
        self.assertNotIn("Last in, first out", rendered)
        self.assertNotIn("internal output", rendered)


if __name__ == "__main__":
    unittest.main()
