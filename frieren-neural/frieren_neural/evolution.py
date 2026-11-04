"""Evidence-driven self-improvement planning with Guardian-supervised release gates.

This module plans and prioritizes improvements. It deliberately never edits code,
trains a model, deploys, or promotes an artifact by itself.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any

_MAX_TASKS = 8
_MAX_REASON_LENGTH = 240
_SECRET_RE = re.compile(
    r"\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY))\s*[:=]\s*[^\s,;]+",
    re.IGNORECASE,
)
_TASK_HINTS = {
    "turkish_quality_below_threshold": "Improve Turkish fluency using licensed examples and held-out evaluation.",
    "instruction_adherence_below_threshold": "Improve instruction following and add regression cases.",
    "critical_safety_failure": "Investigate the safety failure and add blocking regression coverage.",
    "fabricated_claim": "Improve uncertainty handling and factual-grounding evaluation.",
    "multi_turn_failures": "Improve multi-turn context consistency and memory-boundary tests.",
    "benchmark_outputs_incomplete_or_out_of_order": "Repair benchmark generation and completeness checks.",
    "human_review_missing": "Collect two independent human reviews before requesting Guardian approval.",
    "training_provenance_missing": "Record licensed training-data provenance and artifact lineage.",
    "held_out_metrics_missing_or_invalid": "Run held-out evaluation and record reproducible metrics.",
    "baseline_comparison_missing": "Compare the candidate with a pinned baseline checkpoint.",
    "neural_ci_evidence_not_verified": "Wait for and verify the exact commit's Neural CI run.",
    "neural_staged_tests_not_passed": "Run isolated staged behavior tests and record the results.",
    "neural_memory_isolation_not_passed": "Add and pass cross-user memory-isolation tests.",
    "neural_security_checks_not_passed": "Run security and privacy checks and record the results.",
    "neural_resource_checks_not_passed": "Measure CPU and RSS against the resource limits.",
}


def _safe_reason(value: object) -> str:
    text = str(value or "Unspecified quality gap")
    text = _SECRET_RE.sub(r"\1=[REDACTED]", text)
    text = re.sub(r"\b\d{17,20}\b", "[ID]", text)
    return " ".join(text.split())[:_MAX_REASON_LENGTH]


def _valid_hex(value: object, length: int) -> bool:
    return (
        isinstance(value, str)
        and len(value) == length
        and all(character in "0123456789abcdefABCDEF" for character in value)
    )


def _task_for(reason: object, index: int) -> dict[str, str]:
    safe = _safe_reason(reason)
    key = safe.lower()
    title = next(
        (hint for marker, hint in _TASK_HINTS.items() if marker in key),
        f"Investigate and resolve: {safe}",
    )
    digest = hashlib.sha256(f"{index}:{safe}".encode("utf-8")).hexdigest()[:12]
    return {
        "id": f"evo-{digest}",
        "title": title,
        "reason": safe,
        "status": "proposed",
    }


def build_evolution_plan(report: object) -> dict[str, Any]:
    """Create a deterministic plan from CI and model-quality evidence.

    Only a fully evidenced candidate can be submitted for independent Guardian
    review. Even then, apply_changes is always false.
    """
    data = report if isinstance(report, Mapping) else {}
    ci = data.get("ci") if isinstance(data.get("ci"), Mapping) else {}
    quality = data.get("quality_report") if isinstance(data.get("quality_report"), Mapping) else {}
    human = quality.get("human_review") if isinstance(quality.get("human_review"), Mapping) else {}
    metrics = quality.get("metrics") if isinstance(quality.get("metrics"), Mapping) else {}
    baseline = quality.get("baseline_comparison") if isinstance(quality.get("baseline_comparison"), Mapping) else {}

    ci_passed = ci.get("status") == "success" and ci.get("failed") == 0 and ci.get("skipped") == 0
    quality_ready = (
        quality.get("decision") == "READY FOR STAGED TEST"
        and human.get("completed") is True
        and isinstance(metrics.get("critical_safety_failures"), list)
        and not metrics.get("critical_safety_failures")
        and isinstance(metrics.get("fabricated_claims"), list)
        and not metrics.get("fabricated_claims")
        and isinstance(quality.get("blocking_reasons"), list)
        and not quality.get("blocking_reasons")
    )
    source_sha = data.get("source_commit_sha")
    artifact_sha = data.get("artifact_sha256")
    outputs = quality.get("outputs") if isinstance(quality.get("outputs"), list) else []
    averages = metrics.get("dimension_averages") if isinstance(metrics.get("dimension_averages"), Mapping) else {}
    dimensions = ("correctness", "instruction_adherence", "turkish_quality", "grounding", "safety_privacy", "conversation_consistency")
    def meets(value: object, threshold: float) -> bool:
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= threshold

    thresholds_passed = (
        all(meets(averages.get(key), 3.2) for key in dimensions)
        and meets(metrics.get("overall_average"), 3.4)
        and meets(metrics.get("instruction_adherence_3_or_4_rate"), 0.9)
        and meets(metrics.get("turkish_quality_3_or_4_rate"), 0.9)
        and isinstance(metrics.get("multi_turn_failures"), list) and not metrics["multi_turn_failures"]
    )
    outputs_complete = len(outputs) == 24 and all(
        isinstance(item, Mapping) and item.get("id") == f"TR-{index:03d}" and isinstance(item.get("output"), str) and bool(item["output"].strip())
        for index, item in enumerate(outputs, 1)
    )
    report_provenance_matches = (
        quality.get("source_commit_sha") == source_sha
        and quality.get("artifact_sha256") == artifact_sha
        and quality.get("checkpoint_sha256") == artifact_sha
    )
    baseline_improved = (
        baseline.get("available") is True and baseline.get("improved") is True
        and _valid_hex(baseline.get("baseline_checkpoint_sha256"), 64)
    )
    review_policy_valid = (
        isinstance(human.get("reviewers_required"), int)
        and not isinstance(human.get("reviewers_required"), bool)
        and human.get("reviewers_required") == 2
    )
    provenance_valid = (
        _valid_hex(source_sha, 40)
        and _valid_hex(artifact_sha, 64)
        and report_provenance_matches
        and review_policy_valid
    )
    gates = {
        "ci_passed": ci_passed,
        "quality_ready": quality_ready,
        "quality_thresholds_passed": thresholds_passed,
        "benchmark_outputs_complete": outputs_complete,
        "baseline_improved": baseline_improved,
        "review_policy_valid": review_policy_valid,
        "provenance_valid": provenance_valid,
    }

    raw_reasons = quality.get("blocking_reasons", [])
    if not isinstance(raw_reasons, list):
        raw_reasons = []
    if not ci_passed:
        status, reasons = "blocked", ["CI evidence is missing, incomplete, or unsuccessful."]
    elif not provenance_valid:
        status, reasons = "blocked", ["Source commit, model artifact fingerprint, or two-reviewer policy is invalid."]
    elif not outputs_complete:
        status, reasons = "blocked", ["Benchmark outputs are missing, empty, or out of order."]
    elif not thresholds_passed:
        status = "blocked"
        reasons = raw_reasons or ["Quality metrics are missing or below the required thresholds."]
    elif not quality_ready or not baseline_improved:
        status = "improvement_proposed"
        reasons = raw_reasons or ["Human review or baseline-improvement evidence is incomplete."]
    else:
        status, reasons = "eligible_for_guard_review", []

    tasks = [_task_for(reason, index) for index, reason in enumerate(reasons[:_MAX_TASKS])]
    return {
        "schema_version": 1,
        "status": status,
        "mode": "guardian_supervised",
        "gates": gates,
        "tasks": tasks,
        "requires_guard_review": True,
        "apply_changes": False,
        "source_commit_sha": data.get("source_commit_sha") if _valid_hex(data.get("source_commit_sha"), 40) else None,
        "artifact_sha256": data.get("artifact_sha256") if _valid_hex(data.get("artifact_sha256"), 64) else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a Guardian-supervised Frieren Neural evolution plan.")
    parser.add_argument("--report", required=True, help="JSON file containing CI and quality evidence.")
    parser.add_argument("--output", help="Optional output JSON path; stdout is used by default.")
    args = parser.parse_args()
    report = json.loads(Path(args.report).read_text(encoding="utf-8"))
    plan = build_evolution_plan(report)
    rendered = json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
