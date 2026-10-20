# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""REST /api/config — serve app config defaults to frontend."""
from fastapi import APIRouter, HTTPException

router = APIRouter()

_DEFAULTS = {
    "model_registry": {
        # Models verified May 2026. Anthropic / OpenAI defaults pick the
        # best price/perf tier; OpenRouter defaults to a premium model
        # because BYOK users routing through OpenRouter typically want
        # access to the top tier without juggling multiple provider keys.
        "anthropic": {
            "default_model": "claude-sonnet-4-6",
            "models": [
                "claude-haiku-4-5",
                "claude-sonnet-4-6",
                "claude-opus-4-6",
                "claude-opus-4-7",
            ],
        },
        "openai": {
            "default_model": "gpt-5.4-mini",
            "models": [
                "gpt-5.4-nano",
                "gpt-5.4-mini",
                "gpt-5.4",
                "gpt-5.5",
            ],
        },
        # OpenRouter slugs use the vendor/model format. Verified live
        # against https://openrouter.ai/api/v1/models on 2026-05-07. If
        # you want a model that isn't here, OpenRouter accepts any of its
        # published slugs — but the dropdown only exposes this curated
        # set so users don't have to guess.
        "openrouter": {
            "default_model": "anthropic/claude-opus-4.7",
            "models": [
                "anthropic/claude-opus-4.7",
                "anthropic/claude-opus-4.6-fast",
                "anthropic/claude-sonnet-4.6",
                "openai/gpt-5.5",
                "openai/gpt-5.4",
                "openai/gpt-5.4-mini",
                "google/gemini-3.1-pro-preview",
                "google/gemini-3.1-flash-lite",
            ],
        },
        # Any OpenAI-compatible server — models are fetched dynamically
        # via GET /api/config/compatible_models.
        "openai_compatible": {
            "default_model": "",
            "models": [],
        },
    },
    "tts_providers": {
        "edge_tts":   {"label": "Edge TTS — Free",               "cost_1k": 0.0,   "requires_key": False},
        "openai_tts": {"label": "OpenAI TTS — Standard",         "cost_1k": 0.015, "requires_key": True},
        "google_tts": {"label": "Google Cloud TTS — Premium",    "cost_1k": 0.004, "requires_key": True},
    },
    # Mirrors caption_service.CAPTION_STYLES (minus `brainrot`, which is a
    # pipeline look rather than a picker option) plus the "none" sentinel.
    # This list used to stop at the original three, so Smart Video offered 3 of
    # the engine's 10 styles. tests/test_caption_styles_parity.py pins it.
    "caption_styles": {
        "viral":   {"label": "Viral — yellow word highlight",   "words_per_group": 6},
        "classic": {"label": "Classic — full sentence",         "words_per_group": 8},
        "bold":    {"label": "Bold — green word highlight",     "words_per_group": 4},
        "neon":    {"label": "Neon — pink text, yellow pop",    "words_per_group": 6},
        "minimal": {"label": "Minimal — plain, no highlight",   "words_per_group": 10},
        "karaoke": {"label": "Karaoke — words light up",        "words_per_group": 6},
        "glow":    {"label": "Glow — soft orange glow",         "words_per_group": 6},
        "urban":   {"label": "Bold Urban — punchy bursts",      "words_per_group": 3},
        "warm":    {"label": "Warm Glow — serif, cream tone",   "words_per_group": 6},
        "mono":    {"label": "Monochrome — understated grey",   "words_per_group": 6},
        "none":    {"label": "No captions"},
    },
}


@router.get("/config/voices/{provider}")
async def get_voices(provider: str):
    """Available voices for a TTS provider.

    The frontend has always called this route; it did not exist, so both voice
    pickers fell back to a hand-typed list on EVERY load — and those lists had
    drifted from what the engines accept (see the comment on the fallbacks in
    Voiceover.jsx). Serving the real vocabulary is what stops that class of
    bug: one source, the engine itself.

    Declared before `/config/{key}` for readability; the two path shapes do not
    collide.
    """
    from backend.services.tts_service import TTSProvider, list_voices, tts_api_key

    try:
        tts_provider = TTSProvider(provider)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown TTS provider: {provider}")

    api_key = tts_api_key(provider)
    voices = await list_voices(tts_provider, api_key=api_key)
    return {"provider": provider, "voices": voices}


@router.get("/config/compatible_models")
async def get_compatible_models(base_url: str = "", api_key: str = ""):
    """Fetch available models from an OpenAI-compatible server.

    The frontend calls this when the user selects "OpenAI-compatible" and
    enters a base URL, so they get a dropdown of real models instead of
    typing a model name blind. Falls back to an empty list on any error.

    Also used for the saved provider: when ``base_url`` is empty, reads
    the configured CUSTOM_AI_BASE_URL and CUSTOM_AI_API_KEY from .env or
    UserSettings.
    """
    import logging
    logger = logging.getLogger(__name__)

    from backend.config import settings

    url = base_url.strip()
    key = api_key.strip()

    # Fall back to .env / saved settings when no explicit URL is given
    if not url:
        url = (settings.CUSTOM_AI_BASE_URL or "").strip()
        if not key:
            key = (settings.CUSTOM_AI_API_KEY or "").strip()

    # Also try user settings if still no URL
    if not url:
        try:
            from backend.database import AsyncSessionLocal
            from sqlalchemy import select
            from backend.models.user_settings import UserSettings
            from backend.core.crypto import decrypt_safe
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(UserSettings).where(UserSettings.user_id == "local")
                )
                us = result.scalar_one_or_none()
                if us and us.ai_provider == "openai_compatible" and us.ai_base_url:
                    url = us.ai_base_url.strip()
                    if not key and us.ai_api_key_encrypted:
                        key = decrypt_safe(us.ai_api_key_encrypted) or ""
        except Exception:
            pass

    if not url:
        return {"models": [], "error": "No base URL configured"}

    try:
        models = await _fetch_compatible_models(url, key)
        return {"models": models}
    except Exception as e:
        logger.debug("Failed to fetch compatible models from %s: %s", url, e)
        return {"models": [], "error": str(e)[:200]}


async def _fetch_compatible_models(base_url: str, api_key: str = "") -> list[dict]:
    """Query GET /v1/models (or /models) on an OpenAI-compatible server."""
    import aiohttp

    base = base_url.rstrip("/")
    # Try /v1/models first, then /models (some servers don't use /v1 prefix)
    urls_to_try = []
    if base.endswith("/v1"):
        urls_to_try.append(f"{base}/models")
    else:
        urls_to_try.append(f"{base}/v1/models")
        urls_to_try.append(f"{base}/models")

    headers = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    timeout = aiohttp.ClientTimeout(total=10)

    for url in urls_to_try:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers, timeout=timeout) as resp:
                    if resp.status != 200:
                        continue
                    data = await resp.json()
                    raw = data.get("data", data.get("models", []))
                    if isinstance(raw, list) and len(raw) > 0:
                        models = []
                        for m in raw:
                            model_id = m.get("id", "") if isinstance(m, dict) else str(m)
                            if not model_id:
                                continue
                            owned_by = m.get("owned_by", "") if isinstance(m, dict) else ""
                            models.append({
                                "id": model_id,
                                "owned_by": owned_by,
                            })
                        # Sort alphabetically for a clean picker
                        models.sort(key=lambda x: x["id"])
                        return models
        except Exception:
            continue

    return []


@router.get("/config/{key}")
async def get_config(key: str):
    """Return config for a given key."""
    value = _DEFAULTS.get(key)
    if value is None:
        raise HTTPException(status_code=404, detail=f"Unknown config key: {key}")
    return {"key": key, "value": value}
