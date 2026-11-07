from pathlib import Path
import re


def test_container_runtime_installs_pinned_psycopg_binary_driver():
    dockerfile = Path(__file__).parents[1] / "Dockerfile"
    contents = dockerfile.read_text(encoding="utf-8")

    assert re.search(
        r"\bpsycopg\[binary\]==\d+\.\d+\.\d+",
        contents,
    ), "The Render image must install the pinned psycopg binary driver used by the PostgreSQL API paths."


def test_candidate_training_preflight_starts_only_an_isolated_postgres_service():
    repository_root = Path(__file__).parents[2]
    workflow = repository_root / ".github" / "workflows" / "frieren-neural-chat-max-training.yml"
    contents = workflow.read_text(encoding="utf-8")
    prepare = re.search(r"(?ms)^  prepare:\n(.*?)(?=^  train-8000:)", contents)

    assert prepare, "The candidate training preflight job must exist."
    assert re.search(r"(?m)^    services:\n      postgres:", prepare.group(1))
    assert "image: postgres:16" in prepare.group(1)
    assert "POSTGRES_DB: neural_test" in prepare.group(1)
    assert "- 5432:5432" in prepare.group(1)
    assert 'pg_isready -U postgres -d neural_test' in prepare.group(1)
