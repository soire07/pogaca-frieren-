import json

import pytest

from frieren_neural import quality_evaluation as quality


def test_fixed_prompt_set_contains_24_unique_cases():
    prompts = quality.load_prompt_set()
    assert len(prompts) == 24
    assert len({item["id"] for item in prompts}) == 24
    assert {item["id"] for item in prompts} == {f"TR-{number:03d}" for number in range(1, 25)}


def test_report_without_human_scores_is_not_ready_and_never_self_grades():
    report = quality.build_report(
        checkpoint_sha256="a" * 64,
        checkpoint_step=100,
        outputs=[{"id": f"TR-{number:03d}", "output": "örnek yanıt"} for number in range(1, 25)],
        scores=None,
    )
    assert report["decision"] == "NOT READY"
    assert report["human_review"]["completed"] is False
    assert report["metrics"] is None
    assert report["review_template"]["reviewers"] == ["reviewer_1", "reviewer_2"]


def test_report_applies_quality_gate_to_human_scores():
    scores = quality.empty_score_template()
    for case in scores["cases"]:
        for reviewer in ("reviewer_1", "reviewer_2"):
            case[reviewer] = {
                dimension: 4 for dimension in quality.DIMENSIONS
            }
            case[reviewer]["critical_safety_failure"] = False
            case[reviewer]["fabricated_claim"] = False
    report = quality.build_report(
        checkpoint_sha256="b" * 64,
        checkpoint_step=100,
        outputs=[{"id": f"TR-{number:03d}", "output": "örnek yanıt"} for number in range(1, 25)],
        scores=scores,
        baseline_report={
            "prompt_set_version": quality.PROMPT_SET_VERSION,
            "decoding_settings": quality.DECODING_SETTINGS,
            "checkpoint_sha256": "0" * 64,
            "metrics": {
                "dimension_averages": {dimension: 3.5 for dimension in quality.DIMENSIONS},
                "overall_average": 3.5,
            },
        },
    )
    assert report["decision"] == "READY FOR STAGED TEST"
    assert report["metrics"]["overall_average"] == 4.0
    assert report["metrics"]["instruction_adherence_3_or_4_rate"] == 1.0


def test_report_blocks_critical_failure_even_when_average_is_high():
    scores = quality.empty_score_template()
    for case in scores["cases"]:
        for reviewer in ("reviewer_1", "reviewer_2"):
            reviewer_scores = {dimension: 4 for dimension in quality.DIMENSIONS}
            reviewer_scores["critical_safety_failure"] = False
            reviewer_scores["fabricated_claim"] = False
            case[reviewer] = reviewer_scores
    scores["cases"][0]["reviewer_1"]["critical_safety_failure"] = True
    report = quality.build_report(
        checkpoint_sha256="c" * 64,
        checkpoint_step=100,
        outputs=[{"id": f"TR-{number:03d}", "output": "örnek yanıt"} for number in range(1, 25)],
        scores=scores,
    )
    assert report["decision"] == "NOT READY"
    assert "critical_safety_failure" in report["blocking_reasons"]


def test_score_template_rejects_missing_cases_and_invalid_scores():
    template = quality.empty_score_template()
    template["cases"].pop()
    with pytest.raises(ValueError, match="24"):
        quality.validate_scores(template)

    template = quality.empty_score_template()
    template["cases"][0]["reviewer_1"] = {
        dimension: 5 for dimension in quality.DIMENSIONS
    }
    with pytest.raises(ValueError, match="0 and 4"):
        quality.validate_scores(template)


def test_cli_writes_machine_and_human_readable_report(tmp_path, monkeypatch):
    checkpoint = tmp_path / "checkpoint.pt"
    checkpoint.write_bytes(b"checkpoint")
    monkeypatch.setattr(
        quality,
        "load_checkpoint",
        lambda *_args, **_kwargs: (object(), object(), {"step": 123}),
    )
    monkeypatch.setattr(
        quality,
        "generate_text",
        lambda _model, _tokenizer, prompt, **_kwargs: prompt + " devam",
    )
    monkeypatch.setattr(
        "sys.argv",
        ["frieren-neural-evaluate-quality", "--checkpoint", str(checkpoint),
         "--output-dir", str(tmp_path / "report")],
    )
    quality.main()
    report_path = tmp_path / "report" / "quality-report.json"
    markdown_path = tmp_path / "report" / "quality-report.md"
    scores_path = tmp_path / "report" / "human-scores.template.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["decision"] == "NOT READY"
    assert len(report["outputs"]) == 24
    assert "TR-024" in markdown_path.read_text(encoding="utf-8")
    assert json.loads(scores_path.read_text(encoding="utf-8"))["schema_version"] == 1
