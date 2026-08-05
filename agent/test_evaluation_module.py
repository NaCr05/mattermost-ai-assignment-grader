import unittest
from unittest.mock import patch

from evaluation_module import EvaluationModule
from models import EvaluationReport, EvaluationRequest
from provider_port import ProviderResult
from providers import MockEvaluationProvider


class FakeProvider:
    name = "mock"

    def evaluate(self, _request: EvaluationRequest) -> ProviderResult:
        return ProviderResult(
            report=EvaluationReport(
                completeness={"level": "complete", "comment": "Complete."},
                correctness={"level": "correct", "comment": "Correct."},
                main_problems=["None."],
                suggestions=["Continue."],
                score=95,
                grade="A",
            ),
            provider="mock",
            attempts=1,
            raw_output="internal output",
        )


class EvaluationModuleTests(unittest.TestCase):
    def test_provider_result_is_mapped_to_the_http_contract(self) -> None:
        module = EvaluationModule(FakeProvider())
        request = EvaluationRequest(
            assignment={
                "title": "Stacks",
                "question": "Explain LIFO.",
                "instructions": None,
            },
            submission={"student": "Demo Student", "answer": "LIFO"},
            rubric=None,
        )

        response = module.evaluate(request)

        self.assertEqual(module.mode, "mock")
        self.assertEqual(response.score, 95)
        self.assertEqual(response.provider, "mock")
        self.assertEqual(response.raw_output, "internal output")
        self.assertEqual(response.observability.model_name, "unknown")
        self.assertGreaterEqual(response.observability.duration_ms, 0)
        self.assertEqual(response.observability.usage.total_tokens, 0)

    def test_request_size_limits_are_enforced(self) -> None:
        with self.assertRaises(ValueError):
            EvaluationRequest(
                assignment={
                    "title": "x" * 501,
                    "question": "Question",
                    "instructions": None,
                },
                submission={"student": "Demo Student", "answer": "Answer"},
                rubric=None,
            )

    def test_pascal_execution_is_disabled_by_default(self) -> None:
        request = EvaluationRequest(
            assignment={
                "title": "Pascal's Triangle",
                "question": "Implement generate(numRows).",
                "instructions": None,
            },
            submission={
                "student": "Demo Student",
                "answer": "import os\ndef generate(numRows):\n    return []",
            },
            rubric=None,
        )

        with patch("providers.evaluate_pascal_submission") as execute:
            result = MockEvaluationProvider.from_environment().evaluate(request)

        execute.assert_not_called()
        self.assertEqual(result.report.correctness.level, "uncertain")
        self.assertIn("代码执行已禁用", result.report.main_problems[0])
        self.assertIn('"code_execution": "disabled"', result.raw_output)

    def test_pascal_execution_requires_explicit_opt_in(self) -> None:
        request = EvaluationRequest(
            assignment={
                "title": "Pascal's Triangle",
                "question": "Implement generate(numRows).",
                "instructions": None,
            },
            submission={"student": "Demo Student", "answer": "def generate(n): pass"},
            rubric=None,
        )
        fake_report = EvaluationReport(
            completeness={"level": "complete", "comment": "Complete."},
            correctness={"level": "correct", "comment": "Correct."},
            main_problems=["None."],
            suggestions=["Continue."],
            score=100,
            grade="A",
        )

        with patch.dict("os.environ", {"ENABLE_PASCAL_EXECUTION": "true"}), patch(
            "providers.evaluate_pascal_submission",
            return_value=(fake_report, {"code_execution": "enabled"}),
        ) as execute:
            result = MockEvaluationProvider.from_environment().evaluate(request)

        execute.assert_called_once_with(request)
        self.assertEqual(result.report.score, 100)


if __name__ == "__main__":
    unittest.main()
