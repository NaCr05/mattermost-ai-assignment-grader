import os
from time import perf_counter
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.responses import PlainTextResponse

from evaluation_module import create_evaluation_module
from models import EvaluationRequest, EvaluationResponse
from observability import AgentMetrics, log_event

load_dotenv()

app = FastAPI(title="TIDE Evaluation Agent", version="1.0.0")

evaluation_module = create_evaluation_module(os.getenv("AGENT_MODE", "mock"))
metrics = AgentMetrics()


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "mode": evaluation_module.mode}


@app.get("/metrics", response_class=PlainTextResponse)
def prometheus_metrics() -> str:
    return metrics.render_prometheus()


@app.post("/evaluate", response_model=EvaluationResponse)
def evaluate(
    request: EvaluationRequest,
    response: Response,
    x_request_id: str | None = Header(default=None),
) -> EvaluationResponse:
    request_id = (
        x_request_id.strip()
        if x_request_id and 0 < len(x_request_id.strip()) <= 128
        else str(uuid4())
    )
    response.headers["x-request-id"] = request_id
    started_at = perf_counter()
    try:
        result = evaluation_module.evaluate(request)
        metrics.record_success(result)
        log_event(
            "evaluation.completed",
            request_id=request_id,
            provider=result.provider,
            model=result.observability.model_name,
            prompt_version=result.observability.prompt_version,
            attempts=result.attempts,
            duration_ms=result.observability.duration_ms,
            input_tokens=result.observability.usage.input_tokens,
            output_tokens=result.observability.usage.output_tokens,
            estimated_cost_usd=result.observability.usage.estimated_cost_usd,
        )
        return result
    except Exception as error:
        duration_seconds = perf_counter() - started_at
        metrics.record_failure(evaluation_module.mode, duration_seconds)
        log_event(
            "evaluation.failed",
            request_id=request_id,
            provider=evaluation_module.mode,
            duration_ms=round(duration_seconds * 1000, 2),
            error_type=type(error).__name__,
        )
        raise HTTPException(
            status_code=502,
            detail="Evaluation failed.",
            headers={"x-request-id": request_id},
        ) from error
