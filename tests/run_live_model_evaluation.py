"""Opt-in paid smoke evaluation for a running live Agent.

This script uses a few anonymous synthetic prompts. It never reads Seed or course
datasets and never writes model output to disk.
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request


AGENT_URL = os.getenv("AGENT_URL", "http://127.0.0.1:8000").rstrip("/")


CASES = [
    {
        "id": "correct-linked-list",
        "request": {
            "assignment": {
                "title": "Reverse a singly linked list",
                "question": "Explain the algorithm and its complexity.",
            },
            "submission": {
                "student": "Synthetic Student",
                "answer": (
                    "Iterate with prev, current and next pointers. Save next before "
                    "redirecting current.next to prev. This is O(n) time and O(1) space."
                ),
            },
        },
        "accept": lambda result: result["score"] >= 80
        and result["correctness"]["level"] in {"correct", "mostly_correct"},
    },
    {
        "id": "incorrect-linked-list",
        "request": {
            "assignment": {
                "title": "Reverse a singly linked list",
                "question": "Explain the algorithm and its complexity.",
            },
            "submission": {
                "student": "Synthetic Student",
                "answer": "Sort the node values in descending order and keep every next pointer unchanged.",
            },
        },
        "accept": lambda result: result["score"] <= 50
        and result["correctness"]["level"] in {"incorrect", "uncertain"},
    },
    {
        "id": "insufficient-answer",
        "request": {
            "assignment": {
                "title": "Queue operations",
                "question": "Explain enqueue and dequeue complexity.",
            },
            "submission": {
                "student": "Synthetic Student",
                "answer": "Use a queue.",
            },
        },
        "accept": lambda result: result["score"] <= 70
        or result["correctness"]["level"] == "uncertain",
    },
]


def read_json(path: str) -> dict[str, object]:
    with urllib.request.urlopen(f"{AGENT_URL}{path}", timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def evaluate(payload: dict[str, object]) -> tuple[dict[str, object], float]:
    request = urllib.request.Request(
        f"{AGENT_URL}/evaluate",
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    started_at = time.perf_counter()
    with urllib.request.urlopen(request, timeout=90) as response:
        result = json.loads(response.read().decode("utf-8"))
    return result, round((time.perf_counter() - started_at) * 1000, 2)


def main() -> int:
    if os.getenv("ALLOW_PAID_LIVE_EVALUATION", "").lower() != "true":
        print("Set ALLOW_PAID_LIVE_EVALUATION=true to authorize paid live requests.")
        return 2

    try:
        health = read_json("/health")
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as error:
        print(f"Agent health check failed: {type(error).__name__}")
        return 1
    if health.get("mode") != "live":
        print("Live evaluation requires AGENT_MODE=live.")
        return 2

    summaries = []
    passed = 0
    for case in CASES:
        try:
            result, latency_ms = evaluate(case["request"])
            observed = bool(case["accept"](result))
            observability = result.get("observability", {})
            summaries.append(
                {
                    "id": case["id"],
                    "passed": observed,
                    "score": result.get("score"),
                    "grade": result.get("grade"),
                    "correctness": result.get("correctness", {}).get("level"),
                    "latency_ms": latency_ms,
                    "provider_latency_ms": observability.get("duration_ms"),
                    "total_tokens": observability.get("usage", {}).get("total_tokens"),
                }
            )
            passed += int(observed)
        except (OSError, urllib.error.URLError, json.JSONDecodeError, KeyError) as error:
            summaries.append(
                {"id": case["id"], "passed": False, "error": type(error).__name__}
            )

    print(json.dumps({"passed": passed, "total": len(CASES), "cases": summaries}, indent=2))
    return 0 if passed == len(CASES) else 1


if __name__ == "__main__":
    sys.exit(main())
