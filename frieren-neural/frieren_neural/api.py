"""Authenticated, single-process inference API for Frieren Neural."""

from __future__ import annotations

import hashlib
import hmac
import os
import pickle
import secrets
import time
import threading
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

from .model import GPTLanguageModel
from .tokenizer import BPETokenizer
from .training import generate_text, load_checkpoint


app = FastAPI(
    title="Frieren Neural",
    version="0.1.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
_allowed_origins = [
    origin.strip().rstrip("/")
    for origin in os.environ.get("FRIEREN_ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
if _allowed_origins:
    if "*" in _allowed_origins:
        raise RuntimeError("FRIEREN_ALLOWED_ORIGINS must list explicit trusted origins, not a wildcard.")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=False,
    )
_generation_lock = threading.Lock()
# One active generation plus at most one admitted waiter per process.
_generation_slots = threading.BoundedSemaphore(2)
_login_attempts: dict[str, list[float]] = {}
_login_attempts_lock = threading.Lock()
_MAX_LOGIN_CLIENTS = 2_000
_LOGIN_WINDOW_SECONDS = 300
_MAX_LOGIN_ATTEMPTS = 5
# One global inference lock prevents multiple workers from loading/running duplicate model copies.
_GENERATION_LOCK_IDS = (7_349_201,)
_SESSION_COOKIE = "frieren_session"
_SESSION_TTL_SECONDS = 3_600


class LoginRequest(BaseModel):
    password: str = Field(min_length=16, max_length=256)


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=2_048)
    max_new_tokens: int = Field(default=80, ge=1, le=128)
    temperature: float = Field(default=0.8, gt=0.0, le=2.0)
    top_k: int = Field(default=40, ge=1, le=128)


@lru_cache(maxsize=1)
def _load_runtime(
    checkpoint_path: str, device: str
) -> tuple[GPTLanguageModel, BPETokenizer, dict[str, float | int | str]]:
    return load_checkpoint(checkpoint_path, device=device)


@contextmanager
def _generation_capacity():
    database_url = os.environ.get("FRIEREN_DATABASE_URL", "").strip()
    if database_url:
        try:
            import psycopg

            # Hold a PostgreSQL session lock throughout inference. PostgreSQL
            # releases it automatically if this worker or connection dies.
            with psycopg.connect(database_url, connect_timeout=3, autocommit=True) as connection:
                for lock_id in _GENERATION_LOCK_IDS:
                    acquired = connection.execute(
                        "SELECT pg_try_advisory_lock(%s)", (lock_id,)
                    ).fetchone()[0]
                    if acquired:
                        yield
                        return
                raise HTTPException(status_code=503, detail="Generation capacity is busy. Try again shortly.")
        except HTTPException:
            raise
        except Exception as error:
            # Configured shared protection must fail closed, never fall back
            # silently to a weaker process-local limit.
            raise HTTPException(status_code=503, detail="Shared generation capacity is temporarily unavailable.") from error
        return

    # Local development fallback. Production must use one worker and one instance.
    if not _generation_slots.acquire(blocking=False):
        raise HTTPException(status_code=503, detail="Generation capacity is busy. Try again shortly.")
    try:
        yield
    finally:
        _generation_slots.release()


def clear_runtime_cache() -> None:
    """Clear the loaded model after checkpoint or environment changes."""
    _load_runtime.cache_clear()


def _checkpoint_path() -> Path:
    return Path(os.environ.get("FRIEREN_CHECKPOINT", "checkpoints/frieren-neural.pt"))


def _authenticate(authorization: str | None) -> None:
    expected = os.environ.get("FRIEREN_API_TOKEN", "")
    if len(expected) < 32:
        raise HTTPException(status_code=503, detail="Generation API is not configured.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid bearer token.")
    supplied = authorization.removeprefix("Bearer ").strip()
    if not secrets.compare_digest(supplied, expected):
        raise HTTPException(status_code=401, detail="Invalid bearer token.")


@app.get("/health")
def health() -> dict[str, str]:
    checkpoint = _checkpoint_path()
    if not checkpoint.is_file():
        return {"status": "model_unavailable"}
    try:
        with _generation_capacity(), _generation_lock:
            _load_runtime(str(checkpoint.resolve()), os.environ.get("FRIEREN_DEVICE", "cpu"))
    except HTTPException as error:
        if error.status_code == 503:
            return {"status": "busy"}
        raise
    except (OSError, RuntimeError, ValueError, KeyError, EOFError, pickle.UnpicklingError):
        return {"status": "model_unavailable"}
    return {"status": "ready"}


@app.post("/generate")
def generate(
    request: GenerateRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, str | int]:
    _authenticate(authorization)
    checkpoint = _checkpoint_path()
    if not checkpoint.is_file():
        raise HTTPException(status_code=503, detail="Model checkpoint is unavailable.")
    device = os.environ.get("FRIEREN_DEVICE", "cpu")
    with _generation_capacity(), _generation_lock:
        try:
            model, tokenizer, metadata = _load_runtime(str(checkpoint.resolve()), device)
        except (OSError, RuntimeError, ValueError, KeyError, EOFError, pickle.UnpicklingError) as error:
            raise HTTPException(status_code=503, detail="Model checkpoint could not be loaded.") from error
        try:
            result = generate_text(
                model, tokenizer, request.prompt, max_new_tokens=request.max_new_tokens,
                temperature=request.temperature, top_k=request.top_k
            )
        except (RuntimeError, ValueError) as error:
            raise HTTPException(status_code=422, detail="The prompt could not be processed.") from error
    return {
        "text": result,
        "completion": _completion_only(request.prompt, result),
        "step": int(metadata["step"]),
    }


def _completion_only(prompt: str, generated: str) -> str:
    """Remove the echoed prompt for chat clients while preserving legacy text output."""
    if generated.startswith(prompt):
        return generated[len(prompt):].lstrip()
    return generated


def _same_origin(request: Request) -> None:
    origin = request.headers.get("origin", "").rstrip("/")
    expected = f"{request.url.scheme}://{request.url.netloc}"
    if not origin or not secrets.compare_digest(origin, expected):
        raise HTTPException(status_code=403, detail="Cross-origin request rejected.")
    if request.url.hostname not in {"localhost", "127.0.0.1", "testserver"} and request.url.scheme != "https":
        raise HTTPException(status_code=403, detail="HTTPS is required for web authentication.")


def _session_signature(expires_at: str, secret: str) -> str:
    return hmac.new(secret.encode("utf-8"), expires_at.encode("ascii"), hashlib.sha256).hexdigest()


def _create_session_token(secret: str) -> str:
    expires_at = str(int(time.time()) + _SESSION_TTL_SECONDS)
    return f"{expires_at}.{_session_signature(expires_at, secret)}"


def _valid_session_token(token: str | None, secret: str) -> bool:
    if not token or len(token) > 77 or "." not in token:
        return False
    expires_at, signature = token.split(".", 1)
    if (
        not expires_at
        or len(expires_at) > 12
        or not expires_at.isascii()
        or not expires_at.isdigit()
        or len(signature) != 64
        or any(character not in "0123456789abcdef" for character in signature)
    ):
        return False
    if int(expires_at) < int(time.time()):
        return False
    expected = _session_signature(expires_at, secret)
    return secrets.compare_digest(signature, expected)


def _login_rate_limit(request: Request) -> str:
    client_ip = request.client.host if request.client else "unknown"
    database_url = os.environ.get("FRIEREN_DATABASE_URL", "").strip()
    if database_url:
        client_key = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()
        try:
            import psycopg

            with psycopg.connect(database_url, connect_timeout=3) as connection:
                with connection.transaction():
                    # Serialize the small login transaction globally so both
                    # limits remain atomic across multiple API workers.
                    connection.execute("SELECT pg_advisory_xact_lock(%s)", (7_349_203,))
                    connection.execute(
                        "DELETE FROM neural_login_attempts WHERE attempted_at < now() - interval '5 minutes'"
                    )
                    count = connection.execute(
                        "SELECT count(*) FROM neural_login_attempts WHERE client_key = %s",
                        (client_key,),
                    ).fetchone()[0]
                    if count >= _MAX_LOGIN_ATTEMPTS:
                        raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
                    if count == 0:
                        distinct_clients = connection.execute(
                            "SELECT count(DISTINCT client_key) FROM neural_login_attempts"
                        ).fetchone()[0]
                        if distinct_clients >= _MAX_LOGIN_CLIENTS:
                            raise HTTPException(status_code=429, detail="Login capacity is temporarily full. Try again later.")
                    connection.execute("INSERT INTO neural_login_attempts (client_key) VALUES (%s)", (client_key,))
            return "db:" + client_key
        except HTTPException:
            raise
        except Exception as error:
            raise HTTPException(status_code=503, detail="Shared login protection is temporarily unavailable.") from error

    now = time.monotonic()
    with _login_attempts_lock:
        recent = [attempt for attempt in _login_attempts.get(client_ip, []) if now - attempt < _LOGIN_WINDOW_SECONDS]
        if len(recent) >= _MAX_LOGIN_ATTEMPTS:
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again later.")
        if client_ip not in _login_attempts and len(_login_attempts) >= _MAX_LOGIN_CLIENTS:
            for ip, attempts in list(_login_attempts.items()):
                if not attempts or now - attempts[-1] >= _LOGIN_WINDOW_SECONDS:
                    _login_attempts.pop(ip, None)
            if len(_login_attempts) >= _MAX_LOGIN_CLIENTS:
                raise HTTPException(status_code=429, detail="Login capacity is temporarily full. Try again later.")
        recent.append(now)
        _login_attempts[client_ip] = recent
    return client_ip


def _clear_login_attempts(client_key: str) -> None:
    if client_key.startswith("db:"):
        database_url = os.environ.get("FRIEREN_DATABASE_URL", "").strip()
        if not database_url:
            raise HTTPException(status_code=503, detail="Shared login protection is temporarily unavailable.")
        try:
            import psycopg

            with psycopg.connect(database_url, connect_timeout=3) as connection:
                connection.execute(
                    "DELETE FROM neural_login_attempts WHERE client_key = %s",
                    (client_key.removeprefix("db:"),),
                )
            return
        except Exception as error:
            raise HTTPException(status_code=503, detail="Shared login protection is temporarily unavailable.") from error
    with _login_attempts_lock:
        _login_attempts.pop(client_key, None)


@app.get("/", response_class=HTMLResponse)
def web_home() -> HTMLResponse:
    page = """<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Frieren Neural</title>
<style>
:root{color-scheme:dark;font-family:system-ui,sans-serif;background:#101116;color:#eee}
body{margin:0;min-height:100vh;display:grid;place-items:center}
main{width:min(760px,calc(100% - 32px));padding:24px;background:#1a1c24;border:1px solid #343744;border-radius:18px}
h1{font-weight:600;letter-spacing:.04em}p{color:#aeb2c0}
textarea,input{box-sizing:border-box;width:100%;padding:12px;background:#11131a;color:#eee;border:1px solid #444958;border-radius:10px}
textarea{min-height:120px;resize:vertical}button{margin-top:12px;padding:10px 16px;border:0;border-radius:9px;background:#d9d3c2;color:#16171b;font-weight:600}
#answer{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;margin-top:20px}
[hidden]{display:none!important}
</style>
</head>
<body><main>
<h1>Frieren Neural</h1><p>Bağımsız deneysel dil modeli</p>
<form id="login">
<label>Web erişim parolası</label><input id="password" type="password" minlength="16" maxlength="256" required autocomplete="current-password">
<button type="submit">Giriş yap</button>
</form>
<section id="chat" hidden>
<textarea id="prompt" maxlength="2048" placeholder="Frieren'e bir şey sor..."></textarea>
<button id="send" type="button">Gönder</button><button id="logout" type="button">Çıkış</button>
<div id="answer" role="status" aria-live="polite"></div>
</section>
<p id="status" role="status" aria-live="polite"></p>
</main>
<script>
const loginForm=document.getElementById("login"),chat=document.getElementById("chat"),statusNode=document.getElementById("status"),answer=document.getElementById("answer");
async function request(path,body){const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.detail||"İstek başarısız.");return data;}
async function checkSession(){try{const response=await fetch("/web/session");const data=await response.json();if(data.authenticated){loginForm.hidden=true;chat.hidden=false;}}catch{}}
loginForm.addEventListener("submit",async event=>{event.preventDefault();statusNode.textContent="";try{await request("/web/login",{password:document.getElementById("password").value});document.getElementById("password").value="";loginForm.hidden=true;chat.hidden=false;}catch(error){statusNode.textContent=error.message;}});
document.getElementById("send").addEventListener("click",async()=>{const prompt=document.getElementById("prompt").value.trim();if(!prompt)return;statusNode.textContent="Yanıt hazırlanıyor...";answer.textContent="";try{const data=await request("/web/generate",{prompt,max_new_tokens:100,temperature:0.8,top_k:40});answer.textContent=data.completion??data.text;statusNode.textContent="";}catch(error){statusNode.textContent=error.message;}});
document.getElementById("logout").addEventListener("click",async()=>{try{await request("/web/logout",{});}catch{}chat.hidden=true;loginForm.hidden=false;answer.textContent="";statusNode.textContent="Oturum kapatıldı.";});
checkSession();
</script></body></html>"""
    nonce = secrets.token_urlsafe(18)
    page = page.replace("<style>", f'<style nonce="{nonce}">', 1)
    page = page.replace("<script>", f'<script nonce="{nonce}">', 1)
    return HTMLResponse(
        page,
        headers={
            "Content-Security-Policy": f"default-src 'none'; style-src 'nonce-{nonce}'; script-src 'nonce-{nonce}'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "Cache-Control": "no-store",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
        },
    )


@app.get("/web/session")
def web_session(request: Request) -> dict[str, bool]:
    secret = os.environ.get("FRIEREN_SESSION_SECRET", "")
    authenticated = len(secret) >= 32 and _valid_session_token(request.cookies.get(_SESSION_COOKIE), secret)
    return {"authenticated": authenticated}


@app.post("/web/login")
def web_login(payload: LoginRequest, request: Request, response: Response) -> dict[str, str]:
    _same_origin(request)
    expected_password = os.environ.get("FRIEREN_WEB_PASSWORD", "")
    secret = os.environ.get("FRIEREN_SESSION_SECRET", "")
    if len(expected_password) < 16 or len(secret) < 32:
        raise HTTPException(status_code=503, detail="Web authentication is not configured.")
    client_ip = _login_rate_limit(request)
    if not secrets.compare_digest(payload.password, expected_password):
        raise HTTPException(status_code=401, detail="Invalid password.")
    _clear_login_attempts(client_ip)
    response.set_cookie(
        _SESSION_COOKIE,
        _create_session_token(secret),
        max_age=_SESSION_TTL_SECONDS,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="strict",
        path="/",
    )
    return {"status": "authenticated"}


@app.post("/web/logout")
def web_logout(request: Request, response: Response) -> dict[str, str]:
    _same_origin(request)
    response.delete_cookie(_SESSION_COOKIE, path="/", httponly=True, secure=request.url.scheme == "https", samesite="strict")
    return {"status": "logged_out"}


@app.post("/web/generate")
def web_generate(
    payload: GenerateRequest,
    request: Request,
) -> dict[str, str | int]:
    _same_origin(request)
    secret = os.environ.get("FRIEREN_SESSION_SECRET", "")
    if len(secret) < 32 or not _valid_session_token(request.cookies.get(_SESSION_COOKIE), secret):
        raise HTTPException(status_code=401, detail="A valid web session is required.")
    checkpoint = _checkpoint_path()
    if not checkpoint.is_file():
        raise HTTPException(status_code=503, detail="Model checkpoint is unavailable.")
    device = os.environ.get("FRIEREN_DEVICE", "cpu")
    try:
        with _generation_capacity(), _generation_lock:
            model, tokenizer, metadata = _load_runtime(str(checkpoint.resolve()), device)
            result = generate_text(
                model, tokenizer, payload.prompt, max_new_tokens=payload.max_new_tokens,
                temperature=payload.temperature, top_k=payload.top_k
            )
    except (OSError, RuntimeError, ValueError, KeyError, EOFError, pickle.UnpicklingError) as error:
        raise HTTPException(status_code=503, detail="Model could not process the request.") from error
    return {
        "text": result,
        "completion": _completion_only(payload.prompt, result),
        "step": int(metadata["step"]),
    }
