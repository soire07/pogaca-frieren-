import os
import subprocess
import sys
from pathlib import Path


def test_gguf_api_import_does_not_require_torch():
    package_root = Path(__file__).resolve().parents[1]
    script = """
import importlib.abc
import sys

class BlockTorch(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname == "torch" or fullname.startswith("torch."):
            raise ModuleNotFoundError("torch intentionally unavailable in GGUF server test")
        return None

sys.meta_path.insert(0, BlockTorch())
import frieren_neural.api
assert "torch" not in sys.modules
print("GGUF_API_IMPORT_WITHOUT_TORCH=PASS")
"""
    env = os.environ.copy()
    env["PYTHONPATH"] = str(package_root)
    result = subprocess.run(
        [sys.executable, "-c", script],
        env=env,
        check=True,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert "GGUF_API_IMPORT_WITHOUT_TORCH=PASS" in result.stdout
