# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""
Centralized BYOK key resolver.

Per-user keys stored in the DB (encrypted) take precedence over .env
fallbacks. This module provides a single async function that all
services can call to get the effective key for a given service.
"""
import logging
from typing import Optional

from sqlalchemy import select

from backend.config import settings as app_settings
from backend.core.crypto import decrypt_safe
from backend.database import AsyncSessionLocal
from backend.models.user_settings import UserSettings

logger = logging.getLogger(__name__)

# Maps a logical service name → (DB column, .env fallback attribute(s))
_SERVICE_MAP = {
    "youtube":                ("youtube_api_key_encrypted",          ["YOUTUBE_API_KEY"]),
    "youtube_api_key":        ("youtube_api_key_encrypted",          ["YOUTUBE_API_KEY"]),
    "youtube_client_id":      ("youtube_client_id_encrypted",          ["YOUTUBE_CLIENT_ID"]),
    "youtube_client_secret":  ("youtube_client_secret_encrypted",      ["YOUTUBE_CLIENT_SECRET"]),
    "tiktok_client_key":      ("tiktok_client_key_encrypted",          ["TIKTOK_CLIENT_KEY"]),
    "tiktok_client_secret":   ("tiktok_client_secret_encrypted",       ["TIKTOK_CLIENT_SECRET"]),
    "instagram_client_id":    ("instagram_client_id_encrypted",        ["INSTAGRAM_CLIENT_ID", "FACEBOOK_APP_ID"]),
    "instagram_client_secret":("instagram_client_secret_encrypted",    ["INSTAGRAM_CLIENT_SECRET", "FACEBOOK_APP_SECRET"]),
    "instagram_access_token": ("instagram_access_token_encrypted",     ["INSTAGRAM_ACCESS_TOKEN"]),
    "pexels":                 ("pexels_api_key_encrypted",           ["PEXELS_API_KEY"]),
    "pixabay":                ("pixabay_api_key_encrypted",          ["PIXABAY_API_KEY"]),
    "groq":                   ("groq_api_key_encrypted",             ["GROQ_API_KEY"]),
    "google_tts":             ("google_tts_api_keys_encrypted",      ["GOOGLE_TTS_API_KEYS", "GOOGLE_TTS_API_KEY"]),
    "elevenlabs":             ("elevenlabs_api_keys_encrypted",      ["ELEVENLABS_API_KEYS", "ELEVENLABS_API_KEY"]),
    "youtube_cookies":        ("youtube_cookies_encrypted",         ["YOUTUBE_COOKIES", "YOUTUBE_COOKIE_PATH", "YOUTUBE_COOKIES_FILE"]),
}


async def resolve_key(service: str, *, user_id: str = "local") -> str:
    """Return the effective API key for *service*.

    Resolution order:
    1. Per-user encrypted key in DB (decrypted on the fly).
    2. .env fallback(s) from config.py.

    Returns empty string when nothing is configured.
    """
    mapping = _SERVICE_MAP.get(service)
    if mapping is None:
        raise ValueError(f"Unknown service key: {service!r}")

    db_column, env_attrs = mapping

    # 1. Try DB
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(UserSettings).where(UserSettings.user_id == user_id)
            )
            s = result.scalar_one_or_none()
            if not s and user_id != "local":
                result = await db.execute(
                    select(UserSettings).where(UserSettings.user_id == "local")
                )
                s = result.scalar_one_or_none()
            if not s:
                result = await db.execute(
                    select(UserSettings).order_by(UserSettings.id.asc()).limit(1)
                )
                s = result.scalar_one_or_none()
        if s:
            encrypted = getattr(s, db_column, None)
            if encrypted:
                decrypted = decrypt_safe(encrypted)
                if decrypted:
                    return decrypted
    except Exception:
        logger.debug("service_keys: DB lookup for %s failed, falling back to .env", service, exc_info=True)

    # 2. .env fallback
    for attr in env_attrs:
        val = getattr(app_settings, attr, "")
        if val:
            return val

    return ""


def resolve_key_sync(service: str, *, user_id: str = "local") -> str:
    """Synchronous wrapper — runs the async resolver in the current event loop
    if available, otherwise returns only the .env fallback (no DB lookup).
    Useful for code that must remain sync-compatible (e.g. module-level init).
    """
    import asyncio
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # Cannot block inside an already-running event loop; return .env only.
        mapping = _SERVICE_MAP.get(service)
        if mapping is None:
            return ""
        _, env_attrs = mapping
        for attr in env_attrs:
            val = getattr(app_settings, attr, "")
            if val:
                return val
        return ""

    return asyncio.run(resolve_key(service, user_id=user_id))
