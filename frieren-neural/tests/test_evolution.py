from frieren_neural.evolution import build_evolution_plan


def _ready_report():
    return {
        "schema_version": 1,
        "source_commit_sha": "a" * 40,
        "artifact_sha256": "b" * 64,
        "ci": {"status": "success", "failed": 0, "skipped": 0},
        "quality_report": {
            "decision": "READY FOR STAGED TEST",
            "blocking_reasons": [],
            "source_commit_sha": "a" * 40,
            "artifact_sha256": "b" * 64,
            "checkpoint_sha256": "b" * 64,
            "outputs": [{"id": f"TR-{i:03d}", "output": "valid answer"} for i in range(1, 25)],
            "human_review": {"completed": True, "reviewers_required": 2},
            "metrics": {
                "overall_average": 3.8,
                "dimension_averages": {
                    "correctness": 3.8, "instruction_adherence": 3.8,
                    "turkish_quality": 3.8, "grounding": 3.8,
                    "safety_privacy": 3.8, "conversation_consistency": 3.8,
                },
                "instruction_adherence_3_or_4_rate": 0.95,
                "turkish_quality_3_or_4_rate": 0.95,
                "multi_turn_failures": [],
                "critical_safety_failures": [],
                "fabricated_claims": [],
            },
            "baseline_comparison": {
                "available": True, "improved": True,
                "baseline_checkpoint_sha256": "c" * 64,
            },
        },
    }


def test_failed_ci_blocks_evolution_and_never_authorizes_application():
    report = _ready_report()
    report["ci"] = {"status": "failure", "failed": 2, "skipped": 0}
    plan = build_evolution_plan(report)
    assert plan["status"] == "blocked"
    assert plan["gates"]["ci_passed"] is False
    assert plan["apply_changes"] is False
    assert plan["requires_guard_review"] is True


def test_quality_failure_creates_bounded_improvement_tasks():
    report = _ready_report()
    report["quality_report"]["decision"] = "NOT READY"
    report["quality_report"]["blocking_reasons"] = [
        "turkish_quality_below_threshold",
        "critical_safety_failure",
    ]
    plan = build_evolution_plan(report)
    assert plan["status"] == "improvement_proposed"
    assert len(plan["tasks"]) == 2
    assert all(task["status"] == "proposed" for task in plan["tasks"])
    assert plan["apply_changes"] is False


def test_all_quality_gates_only_qualify_a_change_for_guard_review():
    plan = build_evolution_plan(_ready_report())
    assert plan["status"] == "eligible_for_guard_review"
    assert plan["gates"]["quality_ready"] is True
    assert plan["gates"]["baseline_improved"] is True
    assert plan["requires_guard_review"] is True
    assert plan["apply_changes"] is False


def test_missing_or_malformed_evidence_fails_closed():
    for report in ({}, None, {"ci": {"status": "success"}}):
        plan = build_evolution_plan(report)
        assert plan["status"] == "blocked"
        assert plan["apply_changes"] is False


def test_report_text_is_bounded_and_secrets_are_redacted():
    report = _ready_report()
    report["quality_report"]["blocking_reasons"] = [
        "GROQ_API_KEY=secret-value " + "x" * 500,
    ]
    plan = build_evolution_plan(report)
    assert len(plan["tasks"]) == 1
    assert len(plan["tasks"][0]["reason"]) <= 240
    assert "secret-value" not in plan["tasks"][0]["reason"]



def test_missing_benchmark_outputs_or_baseline_fingerprint_blocks_guard_review():
    report = _ready_report()
    report["quality_report"]["outputs"] = []
    plan = build_evolution_plan(report)
    assert plan["status"] == "blocked"
    assert plan["gates"]["benchmark_outputs_complete"] is False
    assert plan["apply_changes"] is False

    report = _ready_report()
    report["quality_report"]["baseline_comparison"]["baseline_checkpoint_sha256"] = "invalid"
    plan = build_evolution_plan(report)
    assert plan["status"] == "improvement_proposed"
    assert plan["gates"]["baseline_improved"] is False


def test_report_commit_or_artifact_mismatch_fails_closed():
    report = _ready_report()
    report["quality_report"]["source_commit_sha"] = "d" * 40
    plan = build_evolution_plan(report)
    assert plan["status"] == "blocked"
    assert plan["gates"]["provenance_valid"] is False

    report = _ready_report()
    report["quality_report"]["metrics"]["multi_turn_failures"] = ["TR-017:reviewer_1"]
    plan = build_evolution_plan(report)
    assert plan["gates"]["quality_thresholds_passed"] is False
    assert plan["apply_changes"] is False

def test_missing_quality_metrics_are_blocked_for_the_correct_reason():
    report = _ready_report()
    report["quality_report"]["metrics"] = {}
    plan = build_evolution_plan(report)
    assert plan["status"] == "blocked"
    assert plan["gates"]["provenance_valid"] is True
    assert plan["gates"]["quality_thresholds_passed"] is False
    assert "Quality metrics are missing" in plan["tasks"][0]["reason"]
    assert plan["apply_changes"] is False


def test_missing_human_review_becomes_a_guard_review_task():
    report = _ready_report()
    report["quality_report"]["human_review"]["completed"] = False
    report["quality_report"]["blocking_reasons"] = ["human_review_missing"]
    plan = build_evolution_plan(report)
    assert plan["status"] == "improvement_proposed"
    assert plan["gates"]["provenance_valid"] is True
    assert "two independent human reviews" in plan["tasks"][0]["title"]
    assert plan["requires_guard_review"] is True
    assert plan["apply_changes"] is False

