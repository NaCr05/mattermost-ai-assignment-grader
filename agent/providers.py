import json
import os

from openai import OpenAI
from pydantic import ValidationError

from models import EvaluationReport, EvaluationRequest
from pascal_grader import evaluate_pascal_submission, is_pascal_assignment
from prompts import PROMPT_VERSION, SYSTEM_PROMPT, build_user_prompt
from provider_port import ProviderResult, ProviderUsage


def _nonnegative_float(value: str | None, default: float = 0.0) -> float:
    try:
        parsed = float(value) if value is not None else default
    except ValueError:
        return default
    return parsed if parsed >= 0 else default


class MockEvaluationProvider:
    name = "mock"

    def __init__(self, *, pascal_execution_enabled: bool = False) -> None:
        self._pascal_execution_enabled = pascal_execution_enabled

    @classmethod
    def from_environment(cls) -> "MockEvaluationProvider":
        enabled = os.getenv("ENABLE_PASCAL_EXECUTION", "false").strip().lower()
        return cls(pascal_execution_enabled=enabled in {"1", "true", "yes", "on"})

    def evaluate(self, request: EvaluationRequest) -> ProviderResult:
        report, evidence = self._evaluate_report(request)
        raw_output = json.dumps(
            {
                "report": report.model_dump(),
                "evidence": evidence,
            },
            ensure_ascii=False,
        )
        return ProviderResult(
            report=report,
            provider="mock",
            attempts=1,
            raw_output=raw_output,
            model_name="mock-rules-v1",
            prompt_version=PROMPT_VERSION,
        )

    def _evaluate_report(
        self,
        request: EvaluationRequest,
    ) -> tuple[EvaluationReport, dict[str, object]]:
        if is_pascal_assignment(request):
            if not self._pascal_execution_enabled:
                return EvaluationReport(
                    completeness={
                        "level": "partial",
                        "comment": "已收到 Pascal 专项提交，但当前环境禁用了代码执行。",
                    },
                    correctness={
                        "level": "uncertain",
                        "comment": "未运行用户代码，无法确认实现的运行正确性。",
                    },
                    main_problems=["代码执行已禁用，未产生动态测试结果。"],
                    suggestions=[
                        "仅在隔离且受控的本地验收环境中显式开启 Pascal 代码执行。"
                    ],
                    score=0,
                    grade="F",
                ), {
                    "strategy": "pascal_execution_disabled",
                    "code_execution": "disabled",
                }
            return evaluate_pascal_submission(request)

        answer = request.submission.answer.lower()

        if all(
            keyword in answer
            for keyword in ("prev", "current", "next", "o(n)", "o(1)")
        ):
            return EvaluationReport(
                completeness={
                    "level": "complete",
                    "comment": "答案覆盖了核心算法、复杂度和边界情况。",
                },
                correctness={
                    "level": "correct",
                    "comment": "三指针迭代思路正确，指针更新顺序合理。",
                },
                main_problems=["当前为文本静态评估，尚未实际编译或运行代码。"],
                suggestions=["补充可执行代码以及空链表、单节点链表测试。"],
                score=95,
                grade="A",
            ), {"strategy": "linked_list_mock"}

        if "next" in answer and ("前一个" in answer or "previous" in answer):
            return EvaluationReport(
                completeness={
                    "level": "partial",
                    "comment": "描述了反转方向和时间复杂度，但缺少完整步骤与空间复杂度。",
                },
                correctness={
                    "level": "mostly_correct",
                    "comment": "总体方向正确，但没有说明如何保存原 next 指针。",
                },
                main_problems=["缺少防止后续链表丢失的临时指针说明。"],
                suggestions=["写出 prev、current、next 的完整更新顺序，并补充空间复杂度。"],
                score=76,
                grade="C",
            ), {"strategy": "linked_list_mock"}

        if "排序" in request.submission.answer or "sort" in answer:
            return EvaluationReport(
                completeness={
                    "level": "incomplete",
                    "comment": "答案没有给出链表指针反转过程或复杂度分析。",
                },
                correctness={
                    "level": "incorrect",
                    "comment": "排序节点值不等同于反转链表结构。",
                },
                main_problems=["混淆了值排序与链表节点连接方向反转。"],
                suggestions=["从修改每个节点 next 指针的方向重新思考。"],
                score=20,
                grade="F",
            ), {"strategy": "linked_list_mock"}

        return EvaluationReport(
            completeness={
                "level": "partial",
                "comment": "答案包含部分描述，但无法确认是否覆盖全部要求。",
            },
            correctness={
                "level": "uncertain",
                "comment": "现有信息不足以稳定判断算法是否正确。",
            },
            main_problems=["关键算法步骤或复杂度分析不够明确。"],
            suggestions=["补充伪代码、关键指针变化和复杂度说明。"],
            score=55,
            grade="F",
        ), {"strategy": "generic_mock"}


class DeepSeekEvaluationProvider:
    name = "deepseek"

    def __init__(
        self,
        *,
        api_key: str | None,
        base_url: str,
        model: str,
        timeout_seconds: float = 60.0,
        input_cost_per_million: float = 0.0,
        output_cost_per_million: float = 0.0,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url
        self._timeout_seconds = timeout_seconds
        self._client: OpenAI | None = None
        self._model = model
        self._input_cost_per_million = input_cost_per_million
        self._output_cost_per_million = output_cost_per_million

    @classmethod
    def from_environment(cls) -> "DeepSeekEvaluationProvider":
        return cls(
            api_key=os.getenv("DEEPSEEK_API_KEY"),
            base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
            model=os.getenv("DEEPSEEK_MODEL", "deepseek-v4-pro"),
            timeout_seconds=float(os.getenv("DEEPSEEK_TIMEOUT_SECONDS", "60")),
            input_cost_per_million=_nonnegative_float(
                os.getenv("DEEPSEEK_INPUT_COST_PER_MILLION_USD")
            ),
            output_cost_per_million=_nonnegative_float(
                os.getenv("DEEPSEEK_OUTPUT_COST_PER_MILLION_USD")
            ),
        )

    def evaluate(self, request: EvaluationRequest) -> ProviderResult:
        if not self._api_key:
            raise ValueError("DEEPSEEK_API_KEY is required when AGENT_MODE=live.")
        if self._client is None:
            self._client = OpenAI(
                api_key=self._api_key,
                base_url=self._base_url,
                timeout=self._timeout_seconds,
                max_retries=1,
            )

        retry_error: str | None = None
        last_raw_output = ""
        input_tokens = 0
        output_tokens = 0

        for attempt in range(1, 3):
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": build_user_prompt(request, retry_error),
                    },
                ],
                response_format={"type": "json_object"},
                temperature=0,
                max_tokens=1200,
            )
            last_raw_output = response.choices[0].message.content or ""
            if response.usage is not None:
                input_tokens += response.usage.prompt_tokens or 0
                output_tokens += response.usage.completion_tokens or 0

            try:
                report = EvaluationReport.model_validate_json(last_raw_output)
                return ProviderResult(
                    report=report,
                    raw_output=last_raw_output,
                    attempts=attempt,
                    provider="deepseek",
                    model_name=self._model,
                    prompt_version=PROMPT_VERSION,
                    usage=ProviderUsage(
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        total_tokens=input_tokens + output_tokens,
                        estimated_cost_usd=round(
                            (
                                input_tokens * self._input_cost_per_million
                                + output_tokens * self._output_cost_per_million
                            )
                            / 1_000_000,
                            8,
                        ),
                    ),
                )
            except ValidationError as error:
                retry_error = str(error)

        raise ValueError("Model output failed validation twice.")
