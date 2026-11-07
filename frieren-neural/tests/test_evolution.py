import pytest

from frieren_neural.evolution import build_evolution_plan
from frieren_neural.quality_evaluation import DIMENSIONS


def _reviewed_report():
    return {
        "decision": "READY FOR STAGED TEST",
        "checkpoint_sha256": "a" * 64,
        "prompt_set_version": "tr-conversation-v1",
        "human_review": {"completed": True, "reviewers_required": 2},
        "baseline_comparison": {"available": True, "improved": True},
        "metrics": {"dimension_averages": {dimension: 4.0 for dimension in DIMENSIONS}},
    }


def test_evolution_plan_targets_only_independently_reviewed_weak_dimensions():
    report = _reviewed_report()
    report["metrics"]["dimension_averages"]["turkish_quality"] = 2.9
    report["metrics"]["dimension_averages"]["grounding"] = 3.2

    plan = build_evolution_plan(report)

    assert plan["status"] == "CURRICULUM_READY_FOR_REVIEW"
    assert {item["dimension"] for item in plan["priority_dimensions"]} == {"turkish_quality", "grounding"}
    assert plan["guardrails"]["model_self_scoring_allowed"] is False
    assert plan["guardrails"]["unreviewed_synthetic_data_allowed"] is False
    assert plan["guardrails"]["automatic_checkpoint_promotion"] is False


def test_evolution_plan_holds_when_human_review_is_missing():
    report = _reviewed_report()
    report["human_review"]["completed"] = False

    plan = build_evolution_plan(report)

    assert plan["status"] == "HOLD"
    assert plan["curriculum_actions"] == []


def test_evolution_plan_holds_when_baseline_improvement_is_not_proven():
    report = _reviewed_report()
    report["baseline_comparison"]["improved"] = False

    plan = build_evolution_plan(report)

    assert plan["status"] == "HOLD"
    assert "comparable_baseline_improvement_not_proven" in plan["blocking_reasons"]


def test_evolution_plan_rejects_invalid_threshold():
    with pytest.raises(ValueError, match="weak_threshold"):
        build_evolution_plan(_reviewed_report(), weak_threshold=5)


def test_candidate_search_cli_loads_manifest_provenance_and_commit(tmp_path, monkeypatch):
    import json
    from frieren_neural import evolution
    from frieren_neural import training

    train_dir = tmp_path / "train"
    heldout_dir = tmp_path / "heldout"
    train_dir.mkdir()
    heldout_dir.mkdir()
    manifest = {
        "schema_version": 1,
        "documents": [{
            "path": "dialogues.txt",
            "source": "pinned dataset",
            "license": "Apache-2.0",
            "usage": "permitted supervised fine-tuning",
        }],
    }
    raw = json.dumps(manifest).encode("utf-8")
    (train_dir / "corpus_manifest.json").write_bytes(raw)
    observed = {}

    monkeypatch.setattr(training, "load_licensed_corpus", lambda _path: ["dialogue"])
    monkeypatch.setattr(evolution, "run_candidate_search", lambda *args, **kwargs: observed.update(kwargs) or {"status": "test"})
    monkeypatch.setenv("GITHUB_SHA", "a" * 40)
    monkeypatch.setattr("sys.argv", [
        "frieren-neural-evolve-search",
        "--train-data", str(train_dir),
        "--heldout-data", str(heldout_dir),
        "--baseline-checkpoint", str(tmp_path / "baseline.pt"),
        "--output-dir", str(tmp_path / "out"),
    ])

    evolution.search_main()

    assert observed["training_provenance"]["manifest_sha256"] == __import__("hashlib").sha256(raw).hexdigest()
    assert observed["training_provenance"]["licenses"] == ["Apache-2.0"]
    assert observed["source_commit_sha"] == "a" * 40
    assert observed["candidate_steps"] == 500
