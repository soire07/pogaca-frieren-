"""Quality-gated self-improvement planning for Frieren Neural.

This module converts independently reviewed benchmark results into a bounded
training curriculum proposal. It never edits source code, training data, or a
production checkpoint automatically.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

PLAYBOOK = {
    "correctness": "curate independently verified question/answer examples; require source and answer checks",
    "instruction_adherence": "curate varied multi-constraint instruction-following dialogues with exact expected outputs",
    "turkish_quality": "curate native-quality Turkish dialogues covering spelling, morphology, fluency, and register",
    "grounding": "curate source-grounded answers, uncertainty handling, and explicit abstention examples",
    "safety_privacy": "curate privacy-preserving refusal and secret-handling examples; never include real credentials",
    "conversation_consistency": "curate multi-turn dialogues covering corrections, context retention, and constraint persistence",
}


def build_evolution_plan(report: dict[str, Any], *, weak_threshold: float = 3.5) -> dict[str, Any]:
    """Create a reviewed-data curriculum plan; never self-grade or auto-promote."""
    if not 0.0 <= weak_threshold <= 4.0:
        raise ValueError("weak_threshold must be between 0 and 4.")
    if not isinstance(report, dict):
        raise ValueError("quality report must be an object.")

    review = report.get("human_review")
    metrics = report.get("metrics")
    comparison = report.get("baseline_comparison")
    ready = (
        report.get("decision") == "READY FOR STAGED TEST"
        and isinstance(review, dict) and review.get("completed") is True
        and isinstance(review.get("reviewers_required"), int)
        and review["reviewers_required"] >= 2
        and isinstance(metrics, dict)
        and isinstance(metrics.get("dimension_averages"), dict)
    )
    plan: dict[str, Any] = {
        "schema_version": 1,
        "engine": "frieren-neural-evolution",
        "status": "HOLD",
        "source_checkpoint_sha256": report.get("checkpoint_sha256"),
        "source_prompt_set_version": report.get("prompt_set_version"),
        "weak_threshold": weak_threshold,
        "priority_dimensions": [],
        "curriculum_actions": [],
        "guardrails": {
            "independent_human_review_required": True,
            "model_self_scoring_allowed": False,
            "unreviewed_synthetic_data_allowed": False,
            "automatic_source_code_mutation": False,
            "automatic_checkpoint_promotion": False,
            "preserve_previous_checkpoint": True,
            "require_same_benchmark_and_decoding_for_comparison": True,
        },
        "blocking_reasons": [],
    }
    if not ready:
        plan["blocking_reasons"] = list(report.get("blocking_reasons") or ["independent_quality_gate_not_passed"])
        return plan

    averages = metrics["dimension_averages"]
    for dimension, action in PLAYBOOK.items():
        value = averages.get(dimension)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not 0 <= value <= 4:
            plan["blocking_reasons"].append(f"invalid_or_missing_dimension:{dimension}")
            continue
        if value < weak_threshold:
            plan["priority_dimensions"].append({"dimension": dimension, "score": value})
            plan["curriculum_actions"].append({"dimension": dimension, "action": action})

    if plan["blocking_reasons"]:
        return plan
    if not isinstance(comparison, dict) or comparison.get("available") is not True or comparison.get("improved") is not True:
        plan["blocking_reasons"].append("comparable_baseline_improvement_not_proven")
        return plan

    if not plan["curriculum_actions"]:
        plan["status"] = "NO_WEAK_DIMENSIONS"
        plan["next_action"] = "Expand the independent benchmark before changing the training corpus."
    else:
        plan["status"] = "CURRICULUM_READY_FOR_REVIEW"
        plan["next_action"] = "Prepare licensed, human-reviewed examples for the listed weak dimensions, then train an isolated candidate."
    return plan


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a quality-gated Frieren Neural self-improvement plan.")
    parser.add_argument("--report", required=True, help="Human-reviewed quality-report.json")
    parser.add_argument("--output", default="evolution-plan.json")
    args = parser.parse_args()
    report = json.loads(Path(args.report).read_text(encoding="utf-8"))
    plan = build_evolution_plan(report)
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\\n", encoding="utf-8")
    print(json.dumps(plan, ensure_ascii=False, indent=2))
