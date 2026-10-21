# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
import os
import secrets
import logging
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

logger = logging.getLogger(__name__)


def _resolve_data_dir() -> Path:
    """Honor VIRALMINT_DATA_DIR (packaged builds point it at a user-writable
    path); dev runs and fresh checkouts fall back to CWD so the DB, storage
    and .env all live relative to where you launched.
    In Docker container environments where /app/storage exists, default to
    /app/storage to ensure SQLite database, .env, and user state are saved
    in the persistent volume across redeployments and container restarts."""
    override = os.getenv("VIRALMINT_DATA_DIR")
    if override:
        p = Path(override).expanduser().resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p

    # Automatic Docker detection: /app/storage is the persistent volume
    docker_storage = Path("/app/storage")
    if docker_storage.is_dir() and Path("/app").is_dir():
        return docker_storage

    return Path.cwd()


DATA_DIR = _resolve_data_dir()


def _migrate_legacy_data(target_dir: Path) -> None:
    """If running with a persistent data dir (e.g. /app/storage) and files exist
    in legacy CWD (/app or repo root), copy them over so no user data is lost."""
    try:
        cwd = Path.cwd()
        if target_dir.resolve() == cwd.resolve():
            return
        # 1. Database
        legacy_db = cwd / "viralmint.db"
        target_db = target_dir / "viralmint.db"
        if legacy_db.exists() and not target_db.exists():
            import shutil
            shutil.copy2(legacy_db, target_db)
            for suffix in ["-wal", "-shm"]:
                legacy_aux = cwd / f"viralmint.db{suffix}"
                if legacy_aux.exists():
                    shutil.copy2(legacy_aux, target_dir / f"viralmint.db{suffix}")
            logger.info("Migrated legacy viralmint.db to persistent data dir: %s", target_db)

        # 2. .env
        legacy_env = cwd / ".env"
        target_env = target_dir / ".env"
        if legacy_env.exists() and not target_env.exists():
            import shutil
            shutil.copy2(legacy_env, target_env)
            logger.info("Migrated legacy .env to persistent data dir: %s", target_env)
    except Exception as e:
        logger.warning("Error during legacy data migration check: %s", e)


_migrate_legacy_data(DATA_DIR)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(DATA_DIR / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ───────────────────────────────────────────
    APP_NAME: str = "ViralMint"
    DEBUG: bool = True
    # Loopback by default. The README markets ViralMint as "100% local —
    # your scripts, transcripts, downloads, and generated videos never
    # leave your machine," and binding to 0.0.0.0 silently breaks that
    # promise: anyone on the same WiFi can reach your library, chat
    # sessions and (encrypted) credential store. Users who genuinely
    # want LAN access (e.g. driving the planner from a phone) can set
    # HOST=0.0.0.0 in their .env explicitly.
    HOST: str = "127.0.0.1"
    PORT: int = 16888
    SECRET_KEY: str = Field(default="")
    ENCRYPTION_KEY: str = Field(default="")  # Fernet key — auto-generated on first run if empty

    # ── Database ──────────────────────────────────────
    DATABASE_URL: str = f"sqlite+aiosqlite:///{DATA_DIR / 'viralmint.db'}"

    # ── Downloads ─────────────────────────────────────
    # Fail a download that has moved ZERO bytes for this long.
    #
    # The wall-clock cap in download_video is not a progress check: yt-dlp's
    # retry budget (socket timeouts and retries with exponential backoff,
    # times the format-fallback ladder) can fill it without ever delivering a
    # byte, and the job then sat at "Downloading…" with no error at all.
    #
    # 600s is deliberately conservative. Legitimate zero-byte gaps do exist —
    # YouTube's player-client cascade and yt-dlp's own retry sleeps — and
    # killing a healthy slow start is a worse failure than reporting late.
    # The watchdog also stands down entirely while a postprocessor (the
    # ffmpeg merge) is running. Lower it if you would rather hear about a
    # dead source sooner.
    DOWNLOAD_STALL_TIMEOUT_S: int = 600

    # ── AI Providers (BYOK) ───────────────────────────
    # Set at least one. OpenRouter unlocks Claude / GPT / Gemini / Llama
    # / Mistral through a single key — handy if you want to mix premium
    # models without managing multiple provider accounts.
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    OPENROUTER_API_KEY: str = ""
    # Any OpenAI-compatible server (Ollama, LM Studio, vLLM, DeepSeek, Groq…).
    # Base URL + model are required; the key is optional for local servers.
    # Deliberately NOT named OPENAI_BASE_URL: the OpenAI SDK reads that
    # variable on its own and would silently redirect the OpenAI provider.
    CUSTOM_AI_BASE_URL: str = ""
    CUSTOM_AI_API_KEY: str = ""
    CUSTOM_AI_MODEL: str = ""

    # ── Groq (cloud Whisper transcription) ────────────
    # Groq runs Whisper large-v3 on LPU hardware — ~10× faster than real time.
    # Free tier gives generous daily minutes. Set this key to enable the "groq"
    # transcription backend alongside the local Whisper engine.
    GROQ_API_KEY: str = ""

    # ── Google Cloud TTS ──────────────────────────────
    # High-quality neural voices with a generous free tier (1M chars/month free
    # on WaveNet + 1M on Standard). Set this API key OR use a service account
    # via GOOGLE_APPLICATION_CREDENTIALS.
    GOOGLE_TTS_API_KEY: str = ""
    # Pool of multiple Google accounts (Google Cloud or Google AI Studio) — comma-separated API keys.
    # When set, enables round-robin rotation and failover across accounts.
    GOOGLE_TTS_API_KEYS: str = ""

    # ── ElevenLabs TTS ────────────────────────────────
    # Ultra-realistic neural voices with multi-account pooling support.
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_API_KEYS: str = ""

    # ── Voice Studio (Port 3900) ──────────────────────
    VOICE_STUDIO_URL: str = "http://localhost:3900"
    VOICE_STUDIO_API_KEY: str = ""

    # ── YouTube Anti-Bot Session Cookies ─────────────
    # Netscape cookies.txt content or path to bypass YouTube "sign-in to confirm you're not a bot"
    YOUTUBE_COOKIES: str = ""
    YOUTUBE_COOKIE_PATH: str = ""

    # ── Service keys (BYOK) ───────────────────────────
    # All optional — features gracefully degrade when keys are missing.
    YOUTUBE_API_KEY: str = ""           # YouTube scout, channel reader, comments
    TIKHUB_API_KEY: str = ""            # TikTok / Douyin scout (alternative: cookies in Settings)
    # ── Stock footage ──
    # Any one of these is enough for stock-video mode. Pexels is tried first
    # when both are set, so an existing install keeps the footage it had.
    PEXELS_API_KEY: str = ""
    PIXABAY_API_KEY: str = ""
    # "auto" (default) uses every configured provider in the order above;
    # "pexels" or "pixabay" pins one and never falls back.
    STOCK_MEDIA_PROVIDER: str = "auto"

    # ── Upload OAuth ──────────────────────────────────
    YOUTUBE_CLIENT_ID: str = ""
    YOUTUBE_CLIENT_SECRET: str = ""
    YOUTUBE_REDIRECT_URI: str = "http://localhost:16888/api/settings/youtube-callback"

    TIKTOK_CLIENT_KEY: str = ""
    TIKTOK_CLIENT_SECRET: str = ""
    TIKTOK_REDIRECT_URI: str = "http://localhost:16888/api/settings/tiktok-upload-callback"

    INSTAGRAM_CLIENT_ID: str = ""
    INSTAGRAM_CLIENT_SECRET: str = ""
    INSTAGRAM_REDIRECT_URI: str = "http://localhost:16888/api/settings/instagram-callback"
    INSTAGRAM_ACCESS_TOKEN: str = ""
    FACEBOOK_APP_ID: str = ""
    FACEBOOK_APP_SECRET: str = ""

    # ── Frontend ──────────────────────────────────────
    FRONTEND_URL: str = "http://localhost:5173"

    # ── Storage paths ─────────────────────────────────
    @property
    def STORAGE_ROOT(self) -> Path:
        if DATA_DIR.name == "storage":
            return DATA_DIR
        return DATA_DIR / "storage"

    @property
    def VIDEOS_DIR(self) -> Path:
        return self.STORAGE_ROOT / "videos"

    @property
    def AUDIO_DIR(self) -> Path:
        return self.STORAGE_ROOT / "audio"

    @property
    def GENERATED_DIR(self) -> Path:
        return self.STORAGE_ROOT / "generated"

    @property
    def THUMBNAILS_DIR(self) -> Path:
        return self.STORAGE_ROOT / "thumbnails"

    @property
    def TMP_DIR(self) -> Path:
        return self.STORAGE_ROOT / "tmp"

    # Smart Video Studio: projects/<id>/ (the files a project owns) and
    # cache/voice/ (voice takes, shared across projects) + cache/preview/
    # (small stock previews). Swept by services/studio_cache.py.
    @property
    def STUDIO_DIR(self) -> Path:
        return DATA_DIR / "studio"

    # Disposable caches (safe to delete): the stock-search response cache.
    @property
    def CACHE_DIR(self) -> Path:
        return DATA_DIR / "cache"

    # ── Motion Graphics (HyperFrames plugin) ──────────
    # The on-demand Node runtime + npm package install here. Deliberately a
    # sibling of storage/ rather than inside it: uninstalling the plugin does
    # rmtree() on this whole directory, and nothing the user made should ever
    # be reachable from that path.
    @property
    def MOTION_DIR(self) -> Path:
        # 1. Prioritize user/runtime custom install in DATA_DIR/motion
        persistent_motion = DATA_DIR / "motion"
        if (persistent_motion / ".installed").exists():
            return persistent_motion
        # 2. Bundled pre-baked motion in Docker container (/app/motion)
        bundled_motion = Path("/app/motion")
        if (bundled_motion / ".installed").exists():
            return bundled_motion
        return persistent_motion

    # Render motion pieces at 4x device-pixel ratio and let the encoder
    # downscale. Text and vectors re-rasterize, which is what a motion graphic
    # is made of, so edges land genuinely sharper. Costs render time only —
    # rendering is local, so this is a time trade and never a money one. Set
    # MOTION_SUPERSAMPLE=false in .env for faster, softer output.
    MOTION_SUPERSAMPLE: bool = True


def _sanitize_settings(s: Settings) -> Settings:
    string_fields = [
        "CUSTOM_AI_MODEL", "CUSTOM_AI_BASE_URL", "CUSTOM_AI_API_KEY",
        "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "OPENROUTER_API_KEY",
        "PEXELS_API_KEY", "PIXABAY_API_KEY", "YOUTUBE_API_KEY", "TIKHUB_API_KEY",
        "GROQ_API_KEY", "GOOGLE_TTS_API_KEY", "GOOGLE_TTS_API_KEYS", "ELEVENLABS_API_KEY", "ELEVENLABS_API_KEYS", "YOUTUBE_COOKIE_PATH",
    ]
    for field in string_fields:
        val = getattr(s, field, "")
        if isinstance(val, str) and val:
            val = val.strip()
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1].strip()
            s.__dict__[field] = val
    return s


def _ensure_secrets(s: Settings) -> Settings:
    """Auto-generate SECRET_KEY and ENCRYPTION_KEY if missing OR invalid.

    Treat .env.example placeholder strings as "not set" so a fresh checkout
    (where someone `cp .env.example .env`'d) doesn't wedge with a literal
    "generate-with-..." value masquerading as a key. Also validate that
    ENCRYPTION_KEY is a real Fernet key (32 url-safe base64 bytes) — without
    this guard, every encrypt() / decrypt() blows up at first use with a
    cryptic "Fernet key must be 32 url-safe base64-encoded bytes" message.

    A VALID key already present (env var or a real .env value) is used as-is
    and never regenerated or rewritten — so a test harness that injects a
    valid Fernet key via env keeps a stable key across the process.
    """
    from cryptography.fernet import Fernet
    env_path = DATA_DIR / ".env"
    lines_to_append = []

    # Anything that starts with `change-me-` or matches the legacy
    # placeholder is a template literal copied from .env.example, not a key.
    secret_placeholders = {
        "change-me-in-production-use-secrets-token-hex-32",
        "generate-with-python-secrets-token-hex-32",
    }
    encryption_placeholders = {"generate-with-fernet-generate-key"}

    def _is_valid_fernet(value: str) -> bool:
        if not value or not isinstance(value, str) or len(value.strip()) < 32:
            return False
        try:
            Fernet(value.strip().encode())
            return True
        except Exception:
            return False

    # 1. SECRET_KEY persistence (preserve across container restarts even if env var is empty)
    stored_secret = None
    secret_file = DATA_DIR / ".secret_key"
    if secret_file.exists():
        cand = secret_file.read_text(encoding="utf-8", errors="ignore").strip()
        if cand and cand not in secret_placeholders and len(cand) >= 32:
            stored_secret = cand
    if not stored_secret and env_path.exists():
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line_str = line.strip()
            if line_str.startswith("SECRET_KEY="):
                cand = line_str.split("=", 1)[1].strip()
                if cand not in secret_placeholders and len(cand) >= 32:
                    stored_secret = cand
                    break

    if s.SECRET_KEY and s.SECRET_KEY not in secret_placeholders and len(s.SECRET_KEY.strip()) >= 32:
        effective_secret = s.SECRET_KEY.strip()
    elif stored_secret:
        effective_secret = stored_secret
    else:
        effective_secret = secrets.token_hex(32)
        lines_to_append.append(f"SECRET_KEY={effective_secret}")
        logger.warning("SECRET_KEY was not set — generated and persisted")

    s.__dict__["SECRET_KEY"] = effective_secret
    try:
        secret_file.write_text(effective_secret, encoding="utf-8")
    except Exception:
        pass

    # 2. ENCRYPTION_KEY persistence (preserve across container restarts even if Coolify/env passes "")
    stored_enc = None
    enc_file = DATA_DIR / ".encryption_key"
    if enc_file.exists():
        cand = enc_file.read_text(encoding="utf-8", errors="ignore").strip()
        if _is_valid_fernet(cand):
            stored_enc = cand
    if not stored_enc and env_path.exists():
        for line in env_path.read_text(encoding="utf-8", errors="ignore").splitlines():
            line_str = line.strip()
            if line_str.startswith("ENCRYPTION_KEY="):
                cand = line_str.split("=", 1)[1].strip()
                if cand not in encryption_placeholders and _is_valid_fernet(cand):
                    stored_enc = cand
                    break

    if s.ENCRYPTION_KEY and s.ENCRYPTION_KEY not in encryption_placeholders and _is_valid_fernet(s.ENCRYPTION_KEY):
        effective_enc = s.ENCRYPTION_KEY.strip()
    elif stored_enc:
        effective_enc = stored_enc
    else:
        effective_enc = Fernet.generate_key().decode()
        lines_to_append.append(f"ENCRYPTION_KEY={effective_enc}")
        logger.warning("ENCRYPTION_KEY was missing/invalid — generated and persisted")

    s.__dict__["ENCRYPTION_KEY"] = effective_enc
    try:
        enc_file.write_text(effective_enc, encoding="utf-8")
    except Exception:
        pass

    if lines_to_append:
        # Persist to .env so keys survive restarts. We have to REWRITE existing
        # lines (not just append) — when the .env held a placeholder for a key
        # we just regenerated, an append-only path would leave the placeholder
        # in place and the regen would happen again on every restart, churning
        # a fresh key each time and breaking decryption of anything written in
        # the previous session.
        existing = env_path.read_text() if env_path.exists() else ""
        existing_lines = existing.splitlines() if existing else []
        new_kv = {line.split("=", 1)[0]: line for line in lines_to_append}
        replaced_keys: set[str] = set()
        out_lines: list[str] = []
        for line in existing_lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                out_lines.append(line)
                continue
            key_name = stripped.split("=", 1)[0].strip()
            if key_name in new_kv:
                out_lines.append(new_kv[key_name])
                replaced_keys.add(key_name)
            else:
                out_lines.append(line)
        for key_name, line in new_kv.items():
            if key_name not in replaced_keys:
                out_lines.append(line)
        env_path.write_text("\n".join(out_lines) + "\n")

    return s


# Singleton — import this everywhere
settings = _ensure_secrets(_sanitize_settings(Settings()))
