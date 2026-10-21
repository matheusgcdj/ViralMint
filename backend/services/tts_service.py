# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""
Multi-provider TTS service.
Unified interface for: OpenAI TTS, Edge TTS, Google Cloud TTS, ElevenLabs, and Voice Studio (port 3900).
Same pattern as ai_provider.py — factory resolves the right backend.
"""
import logging
from enum import Enum
from pathlib import Path

from backend.config import settings
from backend.core.exceptions import VoiceGenerationError

logger = logging.getLogger(__name__)


class TTSProvider(str, Enum):
    OPENAI_TTS = "openai_tts"
    EDGE_TTS = "edge_tts"
    GOOGLE_TTS = "google_tts"
    ELEVENLABS = "elevenlabs"
    VOICESTUDIO = "voicestudio"


PROVIDER_INFO = {
    TTSProvider.OPENAI_TTS: {"label": "OpenAI TTS",       "cost_1k_chars": 0.015, "quality": "standard", "needs_key": True},
    TTSProvider.EDGE_TTS:   {"label": "Edge TTS",         "cost_1k_chars": 0.0,   "quality": "basic",    "needs_key": False},
    TTSProvider.GOOGLE_TTS: {"label": "Google TTS (Cloud & AI Studio)", "cost_1k_chars": 0.004, "quality": "premium",  "needs_key": True},
    TTSProvider.ELEVENLABS: {"label": "ElevenLabs",       "cost_1k_chars": 0.030, "quality": "ultra",    "needs_key": True},
    TTSProvider.VOICESTUDIO: {"label": "Voice Studio (Porta 3900)", "cost_1k_chars": 0.0, "quality": "ultra", "needs_key": False},
}

DEFAULT_VOICES = {
    TTSProvider.OPENAI_TTS: "alloy",                              # alloy|echo|fable|onyx|nova|shimmer
    TTSProvider.EDGE_TTS:   "en-US-AndrewMultilingualNeural",     # Natural multilingual voice
    TTSProvider.GOOGLE_TTS: "pt-BR-Neural2-B",                    # Neural2 Brazilian Portuguese
    TTSProvider.ELEVENLABS: "pNInz6obpgDQGcFmaJgB",               # Adam (autoritário / viral)
    TTSProvider.VOICESTUDIO: "vs-pt-br-marcos",                   # Marcos (Cortes & Podcast)
}


async def generate_tts(
    text: str,
    provider: TTSProvider = TTSProvider.EDGE_TTS,
    voice_id: str = None,
    api_key: str = "",
    output_path: Path = None,
) -> Path:
    """Generate speech using any supported TTS provider. Returns audio file path."""
    if output_path is None:
        output_path = settings.AUDIO_DIR / f"voice_{hash(text) & 0xFFFFFFFF:08x}.mp3"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    voice = voice_id or DEFAULT_VOICES.get(provider, "")

    info = PROVIDER_INFO[provider]
    if info["needs_key"] and not api_key and provider not in (TTSProvider.GOOGLE_TTS, TTSProvider.ELEVENLABS, TTSProvider.VOICESTUDIO):
        raise VoiceGenerationError(f"{info['label']} API key not configured")

    logger.info(f"Generating TTS with {info['label']}, voice={voice}, text_len={len(text)}")

    if provider == TTSProvider.OPENAI_TTS:
        from backend.services.openai_tts_service import generate_voice
        return await generate_voice(text, voice_id=voice, api_key=api_key, output_path=output_path)

    elif provider == TTSProvider.EDGE_TTS:
        from backend.services.edge_tts_service import generate_voice
        return await generate_voice(text, voice_id=voice, output_path=output_path)

    elif provider == TTSProvider.GOOGLE_TTS:
        from backend.services.google_tts_service import generate_voice
        return await generate_voice(text, voice_id=voice, api_key=api_key, output_path=output_path)

    elif provider == TTSProvider.ELEVENLABS:
        from backend.services.elevenlabs_service import generate_voice
        return await generate_voice(text, voice_id=voice, api_key=api_key, output_path=output_path)

    elif provider == TTSProvider.VOICESTUDIO:
        from backend.services.voicestudio_service import VoiceStudioService
        return await VoiceStudioService.generate_voice(text, voice_id=voice, api_key=api_key, output_path=output_path)

    raise VoiceGenerationError(f"Unknown TTS provider: {provider}")


async def list_voices(provider: TTSProvider, api_key: str = "") -> list[dict]:
    """List available voices for a provider."""
    if provider == TTSProvider.OPENAI_TTS:
        return [
            {"voice_id": "alloy",   "name": "Alloy",   "category": "neutral"},
            {"voice_id": "echo",    "name": "Echo",     "category": "male"},
            {"voice_id": "fable",   "name": "Fable",    "category": "british"},
            {"voice_id": "onyx",    "name": "Onyx",     "category": "deep male"},
            {"voice_id": "nova",    "name": "Nova",     "category": "female"},
            {"voice_id": "shimmer", "name": "Shimmer",  "category": "soft female"},
        ]

    elif provider == TTSProvider.EDGE_TTS:
        from backend.services.edge_tts_service import get_voice_list
        return await get_voice_list()

    elif provider == TTSProvider.GOOGLE_TTS:
        from backend.services.google_tts_service import get_voice_list
        return await get_voice_list(api_key=api_key)

    elif provider == TTSProvider.ELEVENLABS:
        from backend.services.elevenlabs_service import get_voice_list
        return await get_voice_list(api_key=api_key)

    elif provider == TTSProvider.VOICESTUDIO:
        from backend.services.voicestudio_service import VoiceStudioService
        return await VoiceStudioService.get_voice_list()

    return []


def estimate_tts_cost(text: str, provider: TTSProvider) -> float:
    """Estimate TTS cost for a given text."""
    chars = len(text)
    cost_per_1k = PROVIDER_INFO[provider]["cost_1k_chars"]
    return round((chars / 1000) * cost_per_1k, 4)


def normalise_tts_provider(value) -> str | None:
    """The canonical provider id for `value`, or None when it isn't one."""
    if isinstance(value, TTSProvider):
        return value.value
    if not isinstance(value, str):
        return None
    try:
        return TTSProvider(value).value
    except ValueError:
        return None


def is_paid_per_take(provider) -> bool:
    p = normalise_tts_provider(provider)
    return p in (TTSProvider.OPENAI_TTS.value, TTSProvider.GOOGLE_TTS.value, TTSProvider.ELEVENLABS.value)


def uses_heavy_pool(provider) -> bool:
    return False


def provider_traits() -> dict:
    return {p.value: {"paid_per_take": is_paid_per_take(p), "needs_key": PROVIDER_INFO[p]["needs_key"],
                      "heavy": uses_heavy_pool(p)} for p in TTSProvider}


def tts_api_key(provider) -> str:
    p = normalise_tts_provider(provider)
    if p == TTSProvider.OPENAI_TTS.value:
        try:
            from backend.models.user_settings import UserSettings
            from backend.core.crypto import decrypt
            from backend.database import engine
            from sqlalchemy import text
            with engine.sync_engine.connect() as sync_conn:
                row = sync_conn.execute(text("SELECT ai_api_key_encrypted FROM user_settings WHERE user_id = 'local' LIMIT 1")).fetchone()
                if row and row[0]:
                    dec = decrypt(row[0])
                    if dec:
                        return dec.strip()
        except Exception:
            pass
        return settings.OPENAI_API_KEY or ""
    if p == TTSProvider.GOOGLE_TTS.value:
        try:
            from backend.models.user_settings import UserSettings
            from backend.core.crypto import decrypt
            from backend.database import engine
            from sqlalchemy import text
            with engine.sync_engine.connect() as sync_conn:
                row = sync_conn.execute(text("SELECT google_tts_api_keys_encrypted FROM user_settings WHERE user_id = 'local' LIMIT 1")).fetchone()
                if row and row[0]:
                    dec = decrypt(row[0])
                    if dec and dec.strip():
                        return dec.strip()
        except Exception:
            pass
        multi = getattr(settings, "GOOGLE_TTS_API_KEYS", "") or ""
        if multi.strip():
            return multi.strip()
        return getattr(settings, "GOOGLE_TTS_API_KEY", "") or ""
    if p == TTSProvider.ELEVENLABS.value:
        try:
            from backend.models.user_settings import UserSettings
            from backend.core.crypto import decrypt
            from backend.database import engine
            from sqlalchemy import text
            with engine.sync_engine.connect() as sync_conn:
                row = sync_conn.execute(text("SELECT elevenlabs_api_keys_encrypted FROM user_settings WHERE user_id = 'local' LIMIT 1")).fetchone()
                if row and row[0]:
                    dec = decrypt(row[0])
                    if dec and dec.strip():
                        return dec.strip()
        except Exception:
            pass
        multi = getattr(settings, "ELEVENLABS_API_KEYS", "") or ""
        if multi.strip():
            return multi.strip()
        return getattr(settings, "ELEVENLABS_API_KEY", "") or ""
    if p == TTSProvider.VOICESTUDIO.value:
        return getattr(settings, "VOICE_STUDIO_API_KEY", "") or ""
    return ""


_CJK_CHAR_RANGES = (
    (0x3040, 0x30FF),
    (0x3400, 0x4DBF), (0x4E00, 0x9FFF), (0xF900, 0xFAFF),
    (0xAC00, 0xD7AF),
)
LATIN_WORDS_PER_SEC = 2.5
CJK_CHARS_PER_SEC = 3.5


def estimate_spoken_seconds(text: str) -> float:
    text = (text or "").strip()
    if not text:
        return 0.0
    cjk = 0
    cur: list[str] = []
    for ch in text:
        cp = ord(ch)
        if any(lo <= cp <= hi for lo, hi in _CJK_CHAR_RANGES):
            cjk += 1
            cur.append(" ")
        else:
            cur.append(ch)
    words = len("".join(cur).split())
    return round(words / LATIN_WORDS_PER_SEC + cjk / CJK_CHARS_PER_SEC, 1)
