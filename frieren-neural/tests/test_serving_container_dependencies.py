from pathlib import Path
import re


def test_container_runtime_installs_pinned_psycopg_binary_driver():
    dockerfile = Path(__file__).parents[1] / "Dockerfile"
    contents = dockerfile.read_text(encoding="utf-8")

    assert re.search(
        r"\bpsycopg\[binary\]==\d+\.\d+\.\d+",
        contents,
    ), "The Render image must install the pinned psycopg binary driver used by the PostgreSQL API paths."
