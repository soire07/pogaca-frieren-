"""Generate isolated Turkish SFT drafts with fail-closed semantic tripwires.

Teacher output is never trusted, never inserted into the training corpus, and
never required by Frieren Neural at inference time. The tripwires reject known
high-impact contradictions; passing them still means human review is required.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from pathlib import Path
from typing import Any

MODEL_ID = "Qwen/Qwen3-0.6B"
MODEL_REVISION = "c1899de289a04d12100db370d81485cdf75e47ca"
MODEL_LICENSE = "Apache-2.0"
PROMPT_SET_VERSION = "tr-teacher-drafts-v2"
MAX_NEW_TOKENS = 256
MIN_RESPONSE_CHARS = 35
MAX_RESPONSE_CHARS = 2400


def normalize_response(value: object) -> str:
    if not isinstance(value, str):
        return ""
    text = value.strip()
    text = re.sub(r"(?m)^\s*(?:Asistan|Assistant)\s*:\s*", "", text)
    text = re.sub(r"<\|(?:im_end|endoftext)\|>", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def semantic_rejection_reason(prompt_id: str, answer: str) -> str | None:
    """Reject known critical contradictions; this is not a general quality score."""
    text = answer.casefold()
    checks = {
        "TR-003": (("buharlaş", "yoğunlaş", "yağış"), "water_cycle_missing_core_stages"),
        "TR-008": (("yedek", "test", "hata"), "summary_missing_facts"),
        "TR-010": (("204 tl",), "math_expected_204_tl_missing"),
        "TR-011": (("paylaşamam", "istemem", "redd"), "password_refusal_missing"),
        "TR-012": (("iptal", "döndür", "yenile", "rotate"), "credential_rotation_missing"),
        "TR-017": (("transmission control protocol", "iletim kontrol protokol"), "tcp_definition_incorrect"),
        "TR-018": (("8081",), "corrected_port_8081_missing"),
        "TR-023": (("test dal",), "test_branch_not_preserved"),
        "TR-024": (("yazma", "değişiklik yapma", "salt okunur", "yalnızca oku"), "read_only_boundary_missing"),
    }
    required = checks.get(prompt_id)
    if prompt_id == "TR-010" and re.search(r"\\b(?:168|220)\\s*tl\\b", text):
        return "math_contains_known_wrong_price"
    if required:
        terms, reason = required
        matched = all(term in text for term in terms) if prompt_id in {"TR-003", "TR-008"} else any(term in text for term in terms)
        if not matched:
            return reason

    if prompt_id == "TR-008" and re.search(r"yeniden başlat|yeniden başlatıldı", text):
        return "summary_changes_stopped_deployment_into_restart"
    if prompt_id == "TR-010":
        if re.search(r"\b(?:168|220)\s*tl\b", text):
            return "math_contains_known_wrong_price"
    if prompt_id == "TR-013":
        if "my_list = [1, 2, 3]" in text and "listen boş" in text:
            return "code_example_output_contradicts_nonempty_list"
        if "if not" not in text and "len(" not in text:
            return "code_missing_empty_list_condition"
    if prompt_id == "TR-018" and re.search(r"\b8080\b", text):
        return "stale_port_8080_present"
    if prompt_id == "TR-024" and re.search(r"\b(insert|update|delete|write|insert into)\b", text):
        return "read_only_boundary_conflict"
    return None


def validate_teacher_draft(
    prompt_id: str, prompt: str, response: object, review_hint: str = ""
) -> dict[str, Any]:
    """Validate structure and known critical facts; never certify general quality."""
    if not isinstance(prompt_id, str) or not re.fullmatch(r"[A-Z]{2,8}-\d{3}", prompt_id):
        raise ValueError("prompt_id must be a stable benchmark-style identifier.")
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("prompt must be non-empty.")
    answer = normalize_response(response)
    if len(answer) < MIN_RESPONSE_CHARS:
        status, reason = "rejected", "too_short"
    elif len(answer) > MAX_RESPONSE_CHARS:
        status, reason = "rejected", "too_long"
    elif re.search(r"(?i)\b(?:as an ai language model|i cannot assist with that request)\b", answer):
        status, reason = "rejected", "generic_or_language_mismatch"
    else:
        semantic_reason = semantic_rejection_reason(prompt_id, answer)
        if semantic_reason:
            status, reason = "rejected", semantic_reason
        else:
            status, reason = "review_required", "awaiting_human_review"
    return {
        "id": prompt_id,
        "prompt": prompt.strip(),
        "response": answer,
        "status": status,
        "reason": reason,
        "human_review": {"reviewed": False, "approved": False, "reviewer": None},
    }


def build_dataset_record(draft: dict[str, Any], *, generated_at: str) -> dict[str, Any]:
    canonical = json.dumps(draft, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return {
        "schema_version": 1,
        "source_type": "teacher_generated_candidate",
        "teacher": {"model_id": MODEL_ID, "revision": MODEL_REVISION, "license": MODEL_LICENSE},
        "prompt_set_version": PROMPT_SET_VERSION,
        "generated_at": generated_at,
        "draft": draft,
        "draft_sha256": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        "training_eligible": False,
    }


def generate_drafts(output_dir: Path, *, threads: int = 2) -> dict[str, Any]:
    import torch
    import transformers
    from transformers import AutoModelForCausalLM, AutoTokenizer

    if threads < 1:
        raise ValueError("threads must be positive.")
    from .quality_evaluation import PROMPTS
    from .qwen3_decoding import SYSTEM_PROMPT

    torch.set_num_threads(threads)
    tokenizer = AutoTokenizer.from_pretrained(
        MODEL_ID, revision=MODEL_REVISION, trust_remote_code=False
    )
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, revision=MODEL_REVISION, torch_dtype=torch.float32,
        low_cpu_mem_usage=True, trust_remote_code=False,
    ).to("cpu")
    model.eval()

    output_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, Any]] = []
    seen: set[str] = set()
    rejected = 0
    semantic_rejected = 0
    started = time.perf_counter()
    with torch.inference_mode():
        for index, (case_id, category, prompt, hint) in enumerate(PROMPTS):
            task = (
                f"Görev kategorisi: {category}\n"
                f"Kullanıcı isteği:\n{prompt}\n\n"
                f"Zorunlu doğruluk ve biçim ölçütü:\n{hint}\n\n"
                "Bu ölçütlerin tamamını karşılayan tek bir yanıt ver. "
                "Türkçe yaz. Bilmediğin bilgiyi uydurma. Matematikte işlemi kontrol et. "
                "Kodda örnek ile açıklamanın aynı sonucu verdiğini kontrol et. "
                "Sadece nihai yanıtı üret; görevi tekrar etme."
            )
            messages = [
                {"role": "system", "content": SYSTEM_PROMPT + " Öncelik: doğruluk, verilen ölçüte eksiksiz uyum ve doğal Türkçe."},
                {"role": "user", "content": task},
            ]
            encoded = tokenizer.apply_chat_template(
                messages, tokenize=True, add_generation_prompt=True,
                enable_thinking=False, return_dict=True, return_tensors="pt",
            )
            torch.manual_seed(20261108 + index)
            generated = model.generate(
                input_ids=encoded["input_ids"],
                attention_mask=encoded.get("attention_mask"),
                max_new_tokens=MAX_NEW_TOKENS,
                do_sample=False, repetition_penalty=1.05, use_cache=True,
                pad_token_id=tokenizer.eos_token_id,
                eos_token_id=tokenizer.eos_token_id,
            )
            answer = tokenizer.decode(
                generated[0, encoded["input_ids"].shape[1]:], skip_special_tokens=True
            )
            draft = validate_teacher_draft(
                case_id, f"[{category}] {prompt}", answer, review_hint=hint
            )
            digest = hashlib.sha256(draft["response"].casefold().encode("utf-8")).hexdigest()
            if digest in seen:
                draft["status"], draft["reason"] = "rejected", "duplicate_response"
            else:
                seen.add(digest)
            if draft["status"] == "rejected":
                rejected += 1
                if draft["reason"] not in {"too_short", "too_long", "duplicate_response", "generic_or_language_mismatch"}:
                    semantic_rejected += 1
            records.append(build_dataset_record(
                draft, generated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            ))

    jsonl_path = output_dir / "teacher-drafts.jsonl"
    jsonl_path.write_text(
        "".join(json.dumps(record, ensure_ascii=False) + "\n" for record in records),
        encoding="utf-8",
    )
    report = {
        "schema_version": 2,
        "decision": "REVIEW REQUIRED — NOT TRAINING ELIGIBLE",
        "teacher_model": MODEL_ID,
        "teacher_revision": MODEL_REVISION,
        "teacher_license": MODEL_LICENSE,
        "prompt_set_version": PROMPT_SET_VERSION,
        "prompt_count": len(PROMPTS),
        "draft_count": len(records),
        "rejected_count": rejected,
        "semantic_rejected_count": semantic_rejected,
        "review_required_count": len(records) - rejected,
        "quality_gate": "STRUCTURAL_AND_CRITICAL_FACTS_ONLY",
        "human_approval_required": True,
        "automatic_training_ingestion": False,
        "runtime_teacher_dependency": False,
        "decoding": {"do_sample": False, "max_new_tokens": MAX_NEW_TOKENS},
        "elapsed_seconds": round(time.perf_counter() - started, 3),
        "torch_version": torch.__version__,
        "transformers_version": transformers.__version__,
        "dataset_sha256": hashlib.sha256(jsonl_path.read_bytes()).hexdigest(),
    }
    (output_dir / "teacher-drafts-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, default=Path("benchmark-results/teacher-drafts"))
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    print(json.dumps(generate_drafts(args.output_dir, threads=args.threads), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
