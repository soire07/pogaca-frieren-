import json

import pytest

from frieren_neural import quality_evaluation as quality


def _set_reviewer_hashes(scores):
    scores["reviewer_identity_hashes"] = {
        "reviewer_1": "a" * 64,
        "reviewer_2": "b" * 64,
    }
    return scores



def test_benchmark_prompt_uses_the_training_chat_template():
    assert quality.format_benchmark_prompt("Merhaba. Bugün nasılsın?") == (
        "Kullanıcı: Merhaba. Bugün nasılsın?\nAsistan:"
    )
    transcript = "Kullanıcı: TCP nedir?\nAsistan:"
    assert quality.format_benchmark_prompt(transcript) == transcript


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
    assert report["review_template"]["reviewers"] == [None, None]


def test_report_applies_quality_gate_to_human_scores():
    scores = _set_reviewer_hashes(quality.empty_score_template())
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
        source_commit_sha="e" * 40,
        training_provenance={"manifest_sha256":"d" * 64, "dataset_id": "3nesdeniz/turkish-daily-dialogues-5k", "dataset_revision": "a" * 40, "source_fingerprint_sha256": "b" * 64, "processed_sha256": "c" * 64, "sample_count": 120, "sources":["Pinned CC BY 4.0 Turkish dialogue corpus"],"licenses":["CC BY 4.0"]},
        checkpoint_metadata={
            "format_version": 2,
            "dialogue_encoding_version": 2,
            "loss_objective_version": 2,
            "training_objective": "assistant_response_tokens_plus_eos",
            "model_config": {"d_model": 16, "n_layers": 1},
            "training_config": {"max_steps": 10},
            "tokenizer_type": "byte_bpe",
            "tokenizer_vocab_size": 280,
            "training_dataset": {
                "dataset_sha256": "d" * 64, "dataset_id": "3nesdeniz/turkish-daily-dialogues-5k",
                "dataset_revision": "a" * 40, "source_fingerprint_sha256": "b" * 64,
                "processed_sha256": "c" * 64, "split": "train", "sample_count": 120,
            },
        },
        heldout_metrics={
            "loss":2.0, "perplexity":7.39, "dataset_sha256":"e"*64, "sample_count":24, "split":"heldout", "evaluation_version":"frieren-neural-heldout-v1",
            "loss_objective_version": 2,
            "checkpoint_training_loss_objective_version": 2,
        },
        baseline_report={
            "decision": "READY TO ESTABLISH BASELINE",
            "baseline_role": "approved_baseline",
            "blocking_reasons": [],
            "prompt_set_version": quality.PROMPT_SET_VERSION,
            "decoding_settings": quality.DECODING_SETTINGS,
            "checkpoint_sha256": "0" * 64,
            "checkpoint_metadata": {
                "format_version": 2, "loss_objective_version": 2,
                "training_dataset": {
                    "dataset_sha256": "d" * 64, "dataset_id": "3nesdeniz/turkish-daily-dialogues-5k",
                    "dataset_revision": "a" * 40, "source_fingerprint_sha256": "b" * 64,
                    "processed_sha256": "c" * 64, "split": "train", "sample_count": 120,
                },
            },
            "source_commit_sha": "f" * 40,
            "training_provenance": {"manifest_sha256": "d" * 64, "dataset_id": "3nesdeniz/turkish-daily-dialogues-5k", "dataset_revision": "a" * 40, "source_fingerprint_sha256": "b" * 64, "processed_sha256": "c" * 64, "sample_count": 120, "sources": ["Pinned Apache-2.0 corpus"], "licenses": ["Apache-2.0"]},
            "heldout_metrics": {
                "loss": 1.5, "perplexity": 4.48, "dataset_sha256": "e" * 64,
                "sample_count": 120, "split": "heldout", "evaluation_version": "frieren-neural-heldout-v1",
                "loss_objective_version": 2, "checkpoint_training_loss_objective_version": 2,
            },
            "outputs": [{"id": f"TR-{number:03d}", "output": "baseline response"} for number in range(1, 25)],
            "human_review": {"completed": True, "reviewers_required": 2, "reviewer_identity_hashes": ["c" * 64, "d" * 64]},
            "review_template": {"reviewers": ["c" * 64, "d" * 64]},
            "metrics": {
                "dimension_averages": {dimension: 3.5 for dimension in quality.DIMENSIONS},
                "overall_average": 3.5,
            },
        },
    )
    assert report["decision"] == "READY FOR STAGED TEST"
    assert report["metrics"]["overall_average"] == 4.0
    assert report["metrics"]["instruction_adherence_3_or_4_rate"] == 1.0
    assert report["baseline_comparison"]["baseline_reviewer_identity_hashes"] == ["c" * 64, "d" * 64]
    assert report["baseline_comparison"]["baseline_loss_objective_version"] == 2


def test_report_blocks_critical_failure_even_when_average_is_high():
    scores = _set_reviewer_hashes(quality.empty_score_template())
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

    template = _set_reviewer_hashes(quality.empty_score_template())
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
        lambda *_args, **_kwargs: (
            object(), object(), {
                "step": 123, "format_version": 2, "dialogue_encoding_version": 2,
                "loss_objective_version": 2, "training_objective": "assistant_response_tokens_plus_eos",
                "model_config": {"d_model": 16}, "training_config": {"max_steps": 123},
                "tokenizer_type": "byte_bpe", "tokenizer_vocab_size": 280,
            }
        ),
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
    assert report["checkpoint_metadata"]["tokenizer_type"] == "byte_bpe"
    assert len(report["outputs"]) == 24
    markdown = markdown_path.read_text(encoding="utf-8")
    assert "TR-024" in markdown
    assert "Checkpoint configuration" in markdown
    assert "Training objective" in markdown
    template = json.loads(scores_path.read_text(encoding="utf-8"))
    assert template["schema_version"] == 1
    assert set(template["cases"][0]["reviewer_1"]) >= set(quality.DIMENSIONS)
    assert template["cases"][0]["reviewer_1"]["critical_safety_failure"] is None



def test_report_blocks_mismatched_heldout_objective():
    scores = _set_reviewer_hashes(quality.empty_score_template())
    for case in scores["cases"]:
        for reviewer in ("reviewer_1", "reviewer_2"):
            case[reviewer] = {
                **{dimension: 4 for dimension in quality.DIMENSIONS},
                "critical_safety_failure": False,
                "fabricated_claim": False,
            }
    report = quality.build_report(
        checkpoint_sha256="e" * 64,
        checkpoint_step=100,
        outputs=[{"id": f"TR-{number:03d}", "output": "örnek"} for number in range(1, 25)],
        scores=scores,
        checkpoint_metadata={
            "format_version": 2, "dialogue_encoding_version": 2,
            "loss_objective_version": 2, "model_config": {"d_model": 16},
            "training_config": {"max_steps": 100}, "tokenizer_type": "byte_bpe",
            "tokenizer_vocab_size": 280,
            "training_dataset": {
                "dataset_sha256": "f" * 64, "dataset_id": "3nesdeniz/turkish-daily-dialogues-5k",
                "dataset_revision": "a" * 40, "source_fingerprint_sha256": "b" * 64,
                "processed_sha256": "c" * 64, "split": "train", "sample_count": 120,
            },
        },
        training_provenance={"manifest_sha256": "f" * 64, "dataset_id": "3nesdeniz/turkish-daily-dialogues-5k", "dataset_revision": "a" * 40, "source_fingerprint_sha256": "b" * 64, "processed_sha256": "c" * 64, "sample_count": 120, "sources": ["Pinned CC BY 4.0 Turkish dialogue corpus"], "licenses": ["CC BY 4.0"]},
        heldout_metrics={
            "loss": 2.0, "perplexity": 7.39, "dataset_sha256": "e" * 64, "sample_count": 24, "split": "heldout", "evaluation_version": "frieren-neural-heldout-v1",
            "loss_objective_version": 1,
            "checkpoint_training_loss_objective_version": 2,
        },
        baseline_report={
            "decision": "READY FOR STAGED TEST",
            "baseline_role": "approved_baseline",
            "blocking_reasons": [],
            "prompt_set_version": quality.PROMPT_SET_VERSION,
            "decoding_settings": quality.DECODING_SETTINGS,
            "checkpoint_sha256": "0" * 64,
            "checkpoint_metadata": {
                "format_version": 2, "loss_objective_version": 2,
                "training_dataset": {
                    "dataset_sha256": "d" * 64, "dataset_id": "3nesdeniz/turkish-daily-dialogues-5k",
                    "dataset_revision": "a" * 40, "source_fingerprint_sha256": "b" * 64,
                    "processed_sha256": "c" * 64, "split": "train", "sample_count": 120,
                },
            },
            "source_commit_sha": "f" * 40,
            "training_provenance": {"manifest_sha256": "d" * 64, "dataset_id": "3nesdeniz/turkish-daily-dialogues-5k", "dataset_revision": "a" * 40, "source_fingerprint_sha256": "b" * 64, "processed_sha256": "c" * 64, "sample_count": 120, "sources": ["Pinned Apache-2.0 corpus"], "licenses": ["Apache-2.0"]},
            "heldout_metrics": {
                "loss": 1.5, "perplexity": 4.48, "dataset_sha256": "e" * 64,
                "sample_count": 120, "split": "heldout", "evaluation_version": "frieren-neural-heldout-v1",
                "loss_objective_version": 2, "checkpoint_training_loss_objective_version": 2,
            },
            "outputs": [{"id": f"TR-{number:03d}", "output": "baseline response"} for number in range(1, 25)],
            "human_review": {"completed": True, "reviewers_required": 2, "reviewer_identity_hashes": ["c" * 64, "d" * 64]},
            "review_template": {"reviewers": ["c" * 64, "d" * 64]},
            "metrics": {
                "dimension_averages": {dimension: 3.5 for dimension in quality.DIMENSIONS},
                "overall_average": 3.5,
            },
        },
    )
    assert report["decision"] == "NOT READY"
    assert "held_out_objective_mismatch" in report["blocking_reasons"]



def test_report_blocks_missing_checkpoint_metadata():
    report = quality.build_report(
        checkpoint_sha256="a" * 64,
        checkpoint_step=1,
        outputs=[{"id": f"TR-{number:03d}", "output": "örnek"} for number in range(1, 25)],
        scores=None,
        heldout_metrics={
            "loss": 2.0, "perplexity": 7.39, "dataset_sha256": "e" * 64, "sample_count": 24, "split": "heldout", "evaluation_version": "frieren-neural-heldout-v1",
            "loss_objective_version": 2,
            "checkpoint_training_loss_objective_version": 0,
        },
    )
    assert "checkpoint_metadata_missing" in report["blocking_reasons"]
    assert "held_out_objective_mismatch" in report["blocking_reasons"]


def test_active_gguf_evaluation_uses_pinned_artifact_and_never_claims_readiness(monkeypatch, tmp_path):
    from frieren_neural import gguf_runtime
    artifact = tmp_path / "candidate.gguf"
    artifact.write_bytes(b"pinned-gguf-test-artifact")
    digest = __import__("hashlib").sha256(artifact.read_bytes()).hexdigest()
    monkeypatch.setattr(gguf_runtime, "MODEL_SHA256", digest)
    monkeypatch.setattr(gguf_runtime, "ensure_model_file", lambda _path=None: artifact)
    monkeypatch.setattr(gguf_runtime, "load_model", lambda _path=None: object())
    monkeypatch.setattr(gguf_runtime, "generate_completion", lambda *_args, **_kwargs: "Merhaba.")
    outputs, artifact_sha = quality.evaluate_gguf_quality(artifact)
    report = quality.build_report(checkpoint_sha256=artifact_sha, checkpoint_step=0, outputs=outputs, scores=None,
        model_backend="ufakzeka", artifact_sha256=artifact_sha)
    assert artifact_sha == digest
    assert len(outputs) == 24
    assert [item["id"] for item in outputs] == [f"TR-{index:03d}" for index in range(1, 25)]
    assert outputs[0]["output"] == "Merhaba."
    assert report["model_backend"] == "ufakzeka"
    assert report["artifact_sha256"] == digest
    assert report["decision"] == "NOT READY"
    assert "human_review_missing" in report["blocking_reasons"]
    assert "checkpoint_metadata_missing" not in report["blocking_reasons"]
    assert "training_provenance_missing" in report["blocking_reasons"]
    assert "held_out_metrics_missing_or_invalid" in report["blocking_reasons"]

def test_guardian_report_upload_uses_https_and_bearer_auth(monkeypatch):
    class Response:
        status = 202
        def __enter__(self): return self
        def __exit__(self, *_args): return False
        def read(self): return b'{"status":"stored","reportSha256":"abc"}'
    captured = {}
    def fake_urlopen(request, timeout):
        captured["url"] = request.full_url
        captured["authorization"] = request.get_header("Authorization")
        captured["timeout"] = timeout
        return Response()
    monkeypatch.setattr(quality.urllib.request, "urlopen", fake_urlopen)
    result = quality.submit_report_to_guardian({"decision": "NOT READY"}, "https://guardian.example.test/internal/neural-quality-report", "s" * 32)
    assert result["status"] == "stored"
    assert captured["authorization"] == "Bearer " + "s" * 32
    assert captured["timeout"] == 10


def test_guardian_report_upload_rejects_http_and_short_secret():
    with pytest.raises(ValueError, match="HTTPS"):
        quality.submit_report_to_guardian({}, "http://guardian.example.test/report", "s" * 32)
    with pytest.raises(ValueError, match="32 characters"):
        quality.submit_report_to_guardian({}, "https://guardian.example.test/report", "short")



def test_ufakzeka_report_requires_review_provenance_and_heldout_evidence(monkeypatch):
    from frieren_neural import gguf_runtime

    artifact_sha = "a" * 64
    monkeypatch.setattr(gguf_runtime, "MODEL_SHA256", artifact_sha)

    scores = _set_reviewer_hashes(quality.empty_score_template())
    for case in scores["cases"]:
        for reviewer in ("reviewer_1", "reviewer_2"):
            case[reviewer] = {
                **{dimension: 4 for dimension in quality.DIMENSIONS},
                "critical_safety_failure": False,
                "fabricated_claim": False,
            }

    outputs = [
        {"id": item["id"], "category": item["category"], "prompt": item["prompt"], "output": "Doğrulanmış test yanıtı."}
        for item in quality.load_prompt_set()
    ]
    baseline = {
        "prompt_set_version": quality.PROMPT_SET_VERSION,
        "decoding_settings": quality.DECODING_SETTINGS,
        "checkpoint_sha256": "b" * 64,
        "human_review": {"completed": True, "reviewers_required": 2, "reviewer_identity_hashes": ["c" * 64, "d" * 64]},
            "review_template": {"reviewers": ["c" * 64, "d" * 64]},
        "metrics": {
            "dimension_averages": {dimension: 3.5 for dimension in quality.DIMENSIONS},
            "overall_average": 3.5,
        },
    }

    report = quality.build_report(
        checkpoint_sha256=artifact_sha,
        checkpoint_step=0,
        outputs=outputs,
        scores=scores,
        baseline_report=baseline,
        model_backend="ufakzeka",
        artifact_sha256=artifact_sha,
        source_commit_sha="d" * 40,
        training_provenance={"manifest_sha256": "f" * 64, "dataset_id": "3nesdeniz/turkish-daily-dialogues-5k", "dataset_revision": "a" * 40, "source_fingerprint_sha256": "b" * 64, "processed_sha256": "c" * 64, "sample_count": 120, "sources": ["Pinned Apache-2.0 corpus"], "licenses": ["Apache-2.0"]},
        heldout_metrics={
            "loss": 1.2,
            "perplexity": 3.32,
            "dataset_sha256": "e" * 64,
            "sample_count": 120,
            "split": "heldout",
            "evaluation_version": "ufakzeka-heldout-v1",
        },
    )

    assert report["decision"] == "NOT READY"
    assert report["pretrained_provenance"]["model_sha256"] == artifact_sha
    assert report["checkpoint_metadata"] is None
    assert "baseline_not_comparable" in report["blocking_reasons"]
    assert report["heldout_metrics"]["dataset_sha256"] == "e" * 64
    assert report["heldout_metrics"]["split"] == "heldout"
    assert report["source_commit_sha"] == "d" * 40
    markdown = quality.render_markdown(report)
    assert "Independent held-out evidence" in markdown
    assert "Dataset SHA-256: " + "e" * 64 in markdown
    assert "Source commit: " + "d" * 40 in markdown



def test_score_template_requires_two_distinct_reviewer_identity_hashes():
    scores = _set_reviewer_hashes(quality.empty_score_template())
    for case in scores["cases"]:
        for reviewer in ("reviewer_1", "reviewer_2"):
            case[reviewer] = {
                **{dimension: 4 for dimension in quality.DIMENSIONS},
                "critical_safety_failure": False,
                "fabricated_claim": False,
            }
    scores["reviewer_identity_hashes"]["reviewer_2"] = "a" * 64
    with pytest.raises(ValueError, match="distinct"):
        quality.validate_scores(scores)


def test_hash_reviewer_identity_requires_private_high_entropy_token():
    with pytest.raises(ValueError, match="32 characters"):
        quality.hash_reviewer_identity("short")
    first = quality.hash_reviewer_identity("private-reviewer-token-" + "a" * 40)
    second = quality.hash_reviewer_identity("private-reviewer-token-" + "b" * 40)
    assert len(first) == 64
    assert first != second



def test_training_license_allowlist_accepts_attribution_licenses_and_rejects_noncommercial():
    assert quality._has_allowed_training_licenses(["Apache-2.0", "CC BY 4.0"])
    assert quality._has_allowed_training_licenses(["MIT", "CC0-1.0"])
    assert not quality._has_allowed_training_licenses(["CC-BY-NC-4.0"])
    assert not quality._has_allowed_training_licenses(["Unknown-License"])



def test_first_scratch_candidate_can_establish_baseline_after_all_absolute_gates_pass():
    scores = _set_reviewer_hashes(quality.empty_score_template())
    for case in scores["cases"]:
        for reviewer in ("reviewer_1", "reviewer_2"):
            case[reviewer] = {dimension: 4 for dimension in quality.DIMENSIONS}
            case[reviewer]["critical_safety_failure"] = False
            case[reviewer]["fabricated_claim"] = False

    report = quality.build_report(
        checkpoint_sha256="b" * 64,
        checkpoint_step=100,
        outputs=[{"id": f"TR-{number:03d}", "output": "doğal Türkçe örnek yanıt"} for number in range(1, 25)],
        scores=scores,
        source_commit_sha="e" * 40,
        training_provenance={
            "manifest_sha256": "d" * 64, "dataset_id": "3nesdeniz/turkish-daily-dialogues-5k", "dataset_revision": "a" * 40, "source_fingerprint_sha256": "b" * 64, "processed_sha256": "c" * 64,
            "sample_count": 120,
            "sources": ["Pinned CC BY 4.0 Turkish dialogue corpus"],
            "licenses": ["CC BY 4.0"],
        },
        checkpoint_metadata={
            "format_version": 2,
            "dialogue_encoding_version": 2,
            "loss_objective_version": 2,
            "training_objective": "assistant_response_tokens_plus_eos",
            "model_config": {"d_model": 16, "n_layers": 1},
            "training_config": {"max_steps": 100},
            "tokenizer_type": "byte_bpe",
            "tokenizer_vocab_size": 280,
            "training_dataset": {
                "dataset_sha256": "d" * 64, "dataset_id": "3nesdeniz/turkish-daily-dialogues-5k",
                "dataset_revision": "a" * 40, "source_fingerprint_sha256": "b" * 64,
                "processed_sha256": "c" * 64, "split": "train", "sample_count": 120,
            },
        },
        heldout_metrics={
            "loss": 1.2,
            "perplexity": 3.32,
            "dataset_sha256": "f" * 64,
            "sample_count": 120,
            "split": "heldout",
            "evaluation_version": "frieren-neural-heldout-v1",
            "loss_objective_version": 2,
            "checkpoint_training_loss_objective_version": 2,
        },
        establish_baseline=True,
    )

    assert report["decision"] == "READY TO ESTABLISH BASELINE"
    assert report["baseline_role"] == "approved_baseline"
    assert report["blocking_reasons"] == []
    assert report["baseline_comparison"]["available"] is False


def test_baseline_establishment_cannot_bypass_missing_comparison_for_candidates():
    report = quality.build_report(
        checkpoint_sha256="b" * 64,
        checkpoint_step=100,
        outputs=[{"id": f"TR-{number:03d}", "output": "örnek"} for number in range(1, 25)],
        scores=None,
        establish_baseline=True,
    )

    assert report["decision"] == "NOT READY"
    assert "human_review_missing" in report["blocking_reasons"]
    assert "checkpoint_metadata_missing" in report["blocking_reasons"]



def test_quality_gate_rejects_checkpoint_attached_to_a_different_training_manifest():
    report = quality.build_report(
        checkpoint_sha256="a" * 64,
        checkpoint_step=10,
        outputs=[{"id": f"TR-{number:03d}", "output": "örnek"} for number in range(1, 25)],
        scores=None,
        source_commit_sha="e" * 40,
        training_provenance={
            "manifest_sha256": "d" * 64,
            "dataset_id": "example/turkish",
            "dataset_revision": "b" * 40,
            "source_fingerprint_sha256": "c" * 64,
            "processed_sha256": "d" * 64,
            "sample_count": 10,
            "sources": ["Pinned test corpus"],
            "licenses": ["Apache-2.0"],
        },
        checkpoint_metadata={
            "format_version": 2,
            "dialogue_encoding_version": 2,
            "loss_objective_version": 2,
            "model_config": {"d_model": 16},
            "training_config": {"max_steps": 10},
            "tokenizer_type": "byte_bpe",
            "tokenizer_vocab_size": 280,
            "training_dataset": {
                "dataset_sha256": "f" * 64,
                "dataset_id": "example/turkish",
                "dataset_revision": "b" * 40,
                "source_fingerprint_sha256": "c" * 64,
                "processed_sha256": "d" * 64,
                "split": "train",
                "sample_count": 10,
            },
        },
        heldout_metrics={
            "loss": 1.2, "perplexity": 3.32, "dataset_sha256": "e" * 64,
            "sample_count": 10, "split": "heldout",
            "evaluation_version": "frieren-neural-heldout-v1",
            "loss_objective_version": 2,
            "checkpoint_training_loss_objective_version": 2,
        },
        establish_baseline=True,
    )

    assert report["decision"] == "NOT READY"
    assert "checkpoint_training_data_mismatch" in report["blocking_reasons"]
