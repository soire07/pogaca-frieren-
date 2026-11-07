"""Quality-gated self-improvement planning for Frieren Neural.

This module converts independently reviewed benchmark results into a bounded
training curriculum proposal. It never edits source code, training data, or a
production checkpoint automatically.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from dataclasses import replace
from pathlib import Path
from typing import Any, Sequence

from .training import TrainingConfig, evaluate_checkpoint, load_checkpoint, train_model

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
    destination.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(plan, ensure_ascii=False, indent=2))


def run_candidate_search(
    training_documents: Sequence[str],
    heldout_documents: Sequence[str],
    baseline_checkpoint: str | Path,
    output_dir: str | Path,
    *,
    candidate_steps: int = 500,
    heldout_batches: int = 25,
    learning_rate_factors: tuple[float, ...] = (0.5, 1.0, 1.5),
    min_relative_improvement: float = 0.002,
    training_provenance: dict[str, Any] | None = None,
    source_commit_sha: str | None = None,
    device: str = "cpu",
) -> dict[str, Any]:
    """Train isolated warm-start candidates and rank them on the same untouched held-out data.

    This routine never replaces the baseline. Even a lower held-out loss only
    earns a human-review candidate status; conversational quality still needs
    the independent 24-prompt/two-reviewer gate.
    """
    if candidate_steps < 1 or heldout_batches < 1:
        raise ValueError("candidate_steps and heldout_batches must be positive.")
    if not math.isfinite(min_relative_improvement) or not 0 <= min_relative_improvement < 1:
        raise ValueError("min_relative_improvement must be finite and in [0, 1).")
    if not learning_rate_factors or any(
        isinstance(factor, bool) or not math.isfinite(factor) or factor <= 0
        for factor in learning_rate_factors
    ):
        raise ValueError("learning_rate_factors must contain positive finite numbers.")

    baseline_path = Path(baseline_checkpoint)
    if not baseline_path.is_file():
        raise FileNotFoundError(f"Baseline checkpoint not found: {baseline_path}")
    baseline_sha = hashlib.sha256(baseline_path.read_bytes()).hexdigest()
    _, _, metadata = load_checkpoint(baseline_path, device=device)
    if metadata["loss_objective_version"] != 2 or metadata["dialogue_encoding_version"] != 2:
        raise ValueError("Baseline must use assistant-response-plus-EOS objective version 2.")
    raw_config = metadata.get("training_config")
    if not isinstance(raw_config, dict):
        raise ValueError("Baseline checkpoint is missing its training configuration.")
    base_config = TrainingConfig(**raw_config)

    baseline_metrics = evaluate_checkpoint(
        baseline_path, heldout_documents, batch_size=base_config.batch_size,
        batches=heldout_batches, seed=base_config.seed, device=device,
    )
    baseline_loss = float(baseline_metrics["loss"])
    if not math.isfinite(baseline_loss):
        raise ValueError("Baseline held-out loss is not finite.")

    from .quality_evaluation import (
        build_report, empty_score_template, evaluate_checkpoint_quality, render_markdown,
    )

    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)

    def write_quality_package(checkpoint: Path, metrics: dict[str, Any], folder: Path) -> str:
        outputs, checkpoint_sha, step, checkpoint_metadata = evaluate_checkpoint_quality(
            checkpoint, device=device
        )
        report = build_report(
            checkpoint_sha256=checkpoint_sha,
            checkpoint_step=step,
            outputs=outputs,
            scores=None,
            checkpoint_metadata=checkpoint_metadata,
            training_provenance=training_provenance,
            heldout_metrics=metrics,
            model_backend="scratch",
            artifact_sha256=checkpoint_sha,
            source_commit_sha=source_commit_sha,
        )
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "quality-report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        (folder / "quality-report.md").write_text(render_markdown(report), encoding="utf-8")
        (folder / "human-scores.template.json").write_text(
            json.dumps(empty_score_template(), ensure_ascii=False, indent=2) + "\\n",
            encoding="utf-8",
        )
        return str(folder / "quality-report.json")

    baseline_quality_report = write_quality_package(
        baseline_path, baseline_metrics, destination / "baseline-quality"
    )
    trials: list[dict[str, Any]] = []
    for index, factor in enumerate(learning_rate_factors, start=1):
        candidate_path = destination / f"candidate-{index:02d}-lr-{factor:g}.pt"
        candidate_config = replace(
            base_config,
            max_steps=candidate_steps,
            learning_rate=base_config.learning_rate * factor,
        )
        try:
            training_metrics = train_model(
                training_documents, candidate_path, candidate_config,
                initialize_from=baseline_path, device=device,
            )
            heldout = evaluate_checkpoint(
                candidate_path, heldout_documents, batch_size=base_config.batch_size,
                batches=heldout_batches, seed=base_config.seed, device=device,
            )
            loss = float(heldout["loss"])
            if not math.isfinite(loss):
                raise ValueError("Candidate held-out loss is not finite.")
            candidate_sha = hashlib.sha256(candidate_path.read_bytes()).hexdigest()
            quality_report_path = write_quality_package(
                candidate_path, heldout, destination / f"{candidate_path.stem}-quality"
            )
            trials.append({
                "candidate_id": f"candidate-{index:02d}",
                "learning_rate_factor": factor,
                "checkpoint": str(candidate_path),
                "checkpoint_sha256": candidate_sha,
                "training": training_metrics,
                "heldout": heldout,
                "quality_report": quality_report_path,
                "status": "IMPROVED_HELDOUT_PENDING_HUMAN_REVIEW"
                if loss < baseline_loss * (1.0 - min_relative_improvement)
                else "NO_PROVEN_HELDOUT_IMPROVEMENT",
            })
        except Exception as error:
            trials.append({
                "candidate_id": f"candidate-{index:02d}",
                "learning_rate_factor": factor,
                "status": "CANDIDATE_FAILED",
                "error_type": type(error).__name__,
                "error": str(error)[:500],
            })

    successful = [item for item in trials if item.get("heldout", {}).get("loss") is not None]
    best = min(successful, key=lambda item: item["heldout"]["loss"]) if successful else None
    improved = bool(best and best["heldout"]["loss"] < baseline_loss * (1.0 - min_relative_improvement))
    report = {
        "schema_version": 1,
        "engine": "frieren-neural-candidate-search",
        "status": "BEST_CANDIDATE_PENDING_INDEPENDENT_HUMAN_REVIEW" if improved
        else "BASELINE_RETAINED_NO_QUALITY_IMPROVEMENT_PROVEN",
        "baseline_quality_report": baseline_quality_report,
        "baseline": {
            "checkpoint": str(baseline_path),
            "checkpoint_sha256": baseline_sha,
            "step": metadata["step"],
            "heldout": baseline_metrics,
        },
        "search": {
            "candidate_steps": candidate_steps,
            "heldout_batches": heldout_batches,
            "learning_rate_factors": list(learning_rate_factors),
            "min_relative_improvement": min_relative_improvement,
            "device": device,
        },
        "best_candidate_id": best["candidate_id"] if improved and best else None,
        "best_candidate_sha256": best["checkpoint_sha256"] if improved and best else None,
        "trials": trials,
        "promotion": {
            "automatic_promotion": False,
            "baseline_overwritten": False,
            "human_review_required": True,
            "two_independent_reviewers_required": True,
            "same_24_prompt_benchmark_required": True,
            "critical_safety_or_fabrication_failure_blocks_promotion": True,
        },
    }
    (destination / "candidate-search-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


def search_main() -> None:
    parser = argparse.ArgumentParser(description="Run isolated quality-gated Frieren Neural candidate training.")
    parser.add_argument("--train-data", required=True, help="Licensed training corpus directory")
    parser.add_argument("--heldout-data", required=True, help="Separate licensed held-out corpus directory")
    parser.add_argument("--baseline-checkpoint", required=True)
    parser.add_argument("--output-dir", default="evolution-candidates")
    parser.add_argument("--candidate-steps", type=int, default=500)
    parser.add_argument("--heldout-batches", type=int, default=25)
    parser.add_argument("--min-relative-improvement", type=float, default=0.002)
    parser.add_argument("--training-manifest", default=None)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    from .training import load_licensed_corpus

    training_provenance = None
    manifest_path = Path(args.training_manifest) if args.training_manifest else Path(args.train_data) / "corpus_manifest.json"
    if manifest_path.is_file():
        raw_manifest = manifest_path.read_bytes()
        manifest = json.loads(raw_manifest.decode("utf-8"))
        entries = manifest.get("documents", []) if isinstance(manifest, dict) else []
        training_provenance = {
            "manifest_sha256": hashlib.sha256(raw_manifest).hexdigest(),
            "sources": sorted({item["source"] for item in entries if isinstance(item, dict) and item.get("source")}),
            "licenses": sorted({item["license"] for item in entries if isinstance(item, dict) and item.get("license")}),
        }
    report = run_candidate_search(
        load_licensed_corpus(args.train_data),
        load_licensed_corpus(args.heldout_data),
        args.baseline_checkpoint,
        args.output_dir,
        candidate_steps=args.candidate_steps,
        heldout_batches=args.heldout_batches,
        min_relative_improvement=args.min_relative_improvement,
        training_provenance=training_provenance,
        source_commit_sha=os.environ.get("GITHUB_SHA"),
        device=args.device,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))
