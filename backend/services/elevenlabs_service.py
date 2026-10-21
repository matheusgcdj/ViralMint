# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""ElevenLabs Text-to-Speech — ultra-realistic neural voice synthesis.

Provides state-of-the-art voice generation with high emotional inflection,
ideal for viral short-form videos and retention optimization.

**Key pool support**: Multiple ElevenLabs accounts can be pooled using ``ELEVENLABS_API_KEYS`` as a
comma-separated list. The service rotates through them using round-robin
with automatic failover — when one key hits its quota or concurrency limit,
the next key takes over transparently with a cooldown.
"""
import asyncio
import hashlib
import json
import logging
import os
import time
import weakref
from pathlib import Path
from typing import Optional

from backend.config import settings
from backend.core.exceptions import VoiceGenerationError

logger = logging.getLogger(__name__)

# Curated set of premier voices for short-form content
RECOMMENDED_VOICES = {
    "pNInz6obpgDQGcFmaJgB": {"name": "Adam", "category": "deep male", "description": "Grave, autoritário — ideal para finanças e mistério"},
    "21m00Tcm4TlvDq8ikWAM": {"name": "Rachel", "category": "calm female", "description": "Conversacional, expressiva — ideal para podcasts e vlogs"},
    "AZnzlk1XvdvUeBnXmlld": {"name": "Domi", "category": "energetic female", "description": "Enérgica, confiante — alta retenção para curiosidades"},
    "EXAVITQu4vr4xnSDxMaL": {"name": "Bella", "category": "expressive female", "description": "Narrativa cinematográfica, storytelling"},
    "ErXwobaYiN019PkySvjV": {"name": "Antoni", "category": "crisp male", "description": "Locução equilibrada e elegante"},
    "TxGEqnHWrfWFTfGW9XjX": {"name": "Josh", "category": "warm male", "description": "Grave, natural — estilo corte de podcast"},
    "VR6AewLTigWG4xSOukaG": {"name": "Arnold", "category": "dramatic male", "description": "Profundo, cinematográfico — terror e mistério"},
    "yoZ06aMxZJJ28mfd3POQ": {"name": "Sam", "category": "dynamic male", "description": "Dinâmico, tom de notícia e produtividade"},
    "MF3mGyEYCl7XYWbV9V6O": {"name": "Elli", "category": "youthful female", "description": "Jovem, moderna — lifestyle e dicas rápidas"},
}

DEFAULT_VOICE = "pNInz6obpgDQGcFmaJgB"  # Adam

# Max concurrent requests per account
_MAX_CONCURRENT = 3

_semaphore_map: weakref.WeakValueDictionary = weakref.WeakValueDictionary()


def _get_semaphore() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    sem = _semaphore_map.get(id(loop))
    if sem is None:
        sem = asyncio.Semaphore(_MAX_CONCURRENT)
        _semaphore_map[id(loop)] = sem
    return sem


class _QuotaExhaustedError(Exception):
    """Raised when a single key hits its quota — triggers pool failover."""
    pass


class _KeyPool:
    """Thread-safe round-robin key pool with automatic failover."""

    _QUOTA_COOLDOWN = 3600  # 1 hour cooldown when quota/credits hit limit

    def __init__(self):
        self._keys: list[str] = []
        self._index = 0
        self._lock = asyncio.Lock()
        self._exhausted: dict[str, float] = {}

    def configure(self, keys: list[str]):
        """Set the key pool from config or settings."""
        seen: set[str] = set()
        unique: list[str] = []
        for k in keys:
            k = k.strip()
            if k and k not in seen:
                unique.append(k)
                seen.add(k)
        self._keys = unique
        self._exhausted = {k: t for k, t in self._exhausted.items() if k in seen}
        logger.info("ElevenLabs key pool configured: %d key(s)", len(unique))

    @property
    def size(self) -> int:
        return len(self._keys)

    @property
    def has_keys(self) -> bool:
        return len(self._keys) > 0

    def _is_healthy(self, key: str) -> bool:
        t = self._exhausted.get(key)
        if t is None:
            return True
        if time.monotonic() - t >= self._QUOTA_COOLDOWN:
            del self._exhausted[key]
            return True
        return False

    async def acquire(self) -> str:
        """Return the next healthy API key (round-robin)."""
        if not self._keys:
            raise VoiceGenerationError(
                "ElevenLabs not configured. Set ELEVENLABS_API_KEY or "
                "ELEVENLABS_API_KEYS in .env or Settings."
            )

        async with self._lock:
            n = len(self._keys)
            for _ in range(n):
                key = self._keys[self._index % n]
                self._index = (self._index + 1) % n
                if self._is_healthy(key):
                    return key

            soonest_key = min(
                self._exhausted,
                key=lambda k: self._exhausted[k],
                default=None,
            )
            if soonest_key:
                wait = self._QUOTA_COOLDOWN - (time.monotonic() - self._exhausted[soonest_key])
                raise VoiceGenerationError(
                    f"All {n} ElevenLabs key(s) are quota-exhausted. "
                    f"Next key recovers in ~{max(1, int(wait / 60))} minutes."
                )
            raise VoiceGenerationError("ElevenLabs key pool is empty")

    def mark_exhausted(self, key: str):
        """Mark a key as temporarily unusable."""
        self._exhausted[key] = time.monotonic()
        healthy = sum(1 for k in self._keys if self._is_healthy(k))
        logger.warning(
            "ElevenLabs key ...%s marked exhausted. %d/%d keys remaining.",
            key[-6:], healthy, len(self._keys),
        )

    def pool_status(self) -> dict:
        """Return pool health info for health dashboard."""
        now = time.monotonic()
        healthy = 0
        exhausted = 0
        for k in self._keys:
            t = self._exhausted.get(k)
            if t is None or now - t >= self._QUOTA_COOLDOWN:
                healthy += 1
            else:
                exhausted += 1
        return {
            "total_keys": len(self._keys),
            "healthy": healthy,
            "exhausted": exhausted,
        }


_key_pool = _KeyPool()


def _init_key_pool():
    """Initialize the key pool from DB or settings."""
    keys: list[str] = []

    # Check DB first for per-user configured key(s)
    try:
        from backend.core.crypto import decrypt
        from backend.database import engine
        from sqlalchemy import text
        with engine.sync_engine.connect() as sync_conn:
            row = sync_conn.execute(
                text("SELECT elevenlabs_api_keys_encrypted FROM user_settings WHERE user_id = 'local' LIMIT 1")
            ).fetchone()
            if row and row[0]:
                dec = decrypt(row[0])
                if dec:
                    keys = [k.strip() for k in dec.replace("\n", ",").split(",") if k.strip()]
    except Exception:
        pass

    if not keys:
        multi = getattr(settings, "ELEVENLABS_API_KEYS", "") or ""
        if multi:
            keys = [k.strip() for k in multi.replace("\n", ",").split(",") if k.strip()]

    if not keys:
        single = getattr(settings, "ELEVENLABS_API_KEY", "") or ""
        if single.strip():
            keys = [single.strip()]

    _key_pool.configure(keys)


_init_key_pool()


def get_key_pool_status() -> dict:
    """Public accessor for the health dashboard."""
    return _key_pool.pool_status()


def reconfigure_key_pool(keys: list[str]):
    """Reconfigure the key pool at runtime."""
    cleaned: list[str] = []
    for k in keys:
        for sub in k.replace("\n", ",").split(","):
            sub = sub.strip()
            if sub:
                cleaned.append(sub)
    _key_pool.configure(cleaned)


# ── REST API implementation ───────────────────────────────────────────────────

_ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1/text-to-speech"


async def _synthesize_rest(
    text: str,
    voice_id: str,
    api_key: str,
    output_path: Path,
    model_id: str = "eleven_multilingual_v2",
) -> Path:
    """Synthesize speech via ElevenLabs REST API."""
    import aiohttp

    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {
            "stability": 0.5,
            "similarity_boost": 0.75,
            "style": 0.0,
            "use_speaker_boost": True,
        },
    }

    url = f"{_ELEVENLABS_API_URL}/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=90)) as resp:
            if resp.status in (401, 429):
                body = await resp.text()
                lower = body.lower()
                if "quota" in lower or "credit" in lower or "limit" in lower or resp.status == 429:
                    raise _QuotaExhaustedError(
                        f"ElevenLabs Key ...{api_key[-6:]}: HTTP {resp.status}: {body[:200]}"
                    )
                raise VoiceGenerationError(f"ElevenLabs API auth error ({resp.status}): {body[:300]}")
            if resp.status != 200:
                body = await resp.text()
                raise VoiceGenerationError(f"ElevenLabs API error ({resp.status}): {body[:300]}")

            audio_bytes = await resp.read()

    if not audio_bytes:
        raise VoiceGenerationError("ElevenLabs returned empty audio response")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(audio_bytes)

    if output_path.stat().st_size == 0:
        raise VoiceGenerationError("ElevenLabs wrote an empty file")

    return output_path


async def generate_voice(
    text: str,
    voice_id: str = DEFAULT_VOICE,
    api_key: str = "",
    output_path: Optional[Path] = None,
) -> Path:
    """Generate speech using ElevenLabs. Returns audio file path."""
    if output_path is None:
        h = hashlib.sha256(f"elevenlabs|{voice_id}|{text}".encode()).hexdigest()[:16]
        output_path = settings.AUDIO_DIR / f"elevenlabs_{h}.mp3"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    sem = _get_semaphore()

    # Case 1: Explicit key(s) passed by caller
    if api_key:
        explicit_keys = [k.strip() for k in api_key.replace("\n", ",").split(",") if k.strip()]
        if len(explicit_keys) > 1:
            last_err = None
            async with sem:
                for k in explicit_keys:
                    try:
                        result = await _synthesize_rest(text, voice_id, k, output_path)
                        logger.info(
                            "ElevenLabs generated: %s (%dKB, voice=%s, key=...%s)",
                            result, result.stat().st_size // 1024, voice_id, k[-6:],
                        )
                        return result
                    except _QuotaExhaustedError as e:
                        logger.warning("ElevenLabs key failover: %s", e)
                        last_err = e
                        continue
            raise VoiceGenerationError(
                f"All {len(explicit_keys)} ElevenLabs key(s) exhausted: {last_err}"
            )
        else:
            async with sem:
                result = await _synthesize_rest(text, voice_id, explicit_keys[0], output_path)
            logger.info(
                "ElevenLabs generated: %s (%dKB, voice=%s)",
                result, result.stat().st_size // 1024, voice_id,
            )
            return result

    # Case 2: Module-level key pool
    if _key_pool.has_keys:
        max_attempts = _key_pool.size
        last_err = None
        for attempt in range(max_attempts):
            key = await _key_pool.acquire()
            try:
                async with sem:
                    result = await _synthesize_rest(text, voice_id, key, output_path)
                logger.info(
                    "ElevenLabs generated: %s (%dKB, voice=%s, pool key %d/%d)",
                    result, result.stat().st_size // 1024, voice_id,
                    attempt + 1, _key_pool.size,
                )
                return result
            except _QuotaExhaustedError as e:
                _key_pool.mark_exhausted(key)
                last_err = e
                continue
        raise VoiceGenerationError(
            f"All {_key_pool.size} ElevenLabs pool key(s) exhausted: {last_err}"
        )

    raise VoiceGenerationError(
        "ElevenLabs not configured. Set ELEVENLABS_API_KEY (single) or "
        "ELEVENLABS_API_KEYS (comma-separated pool) in .env or Settings."
    )


async def get_voice_list(api_key: str = "") -> list[dict]:
    """Return available ElevenLabs voices.

    Queries the API if a key is available, falling back to curated voices.
    """
    effective_key = api_key
    if not effective_key and _key_pool.has_keys:
        try:
            effective_key = await _key_pool.acquire()
        except VoiceGenerationError:
            pass

    if effective_key:
        if "," in effective_key:
            effective_key = effective_key.split(",")[0].strip()
        try:
            return await _fetch_voices_from_api(effective_key)
        except Exception:
            logger.debug("Failed to fetch ElevenLabs voices from API, using curated list")

    # Curated fallback
    voices = []
    for vid, info in RECOMMENDED_VOICES.items():
        voices.append({
            "voice_id": vid,
            "name": f"⭐ {info['name']} — {info['description']}",
            "category": info["category"],
            "locale": "multilingual",
        })
    return voices


async def _fetch_voices_from_api(api_key: str) -> list[dict]:
    """Fetch user's voices from ElevenLabs API."""
    import aiohttp

    url = "https://api.elevenlabs.io/v1/voices"
    headers = {"xi-api-key": api_key}

    async with aiohttp.ClientSession() as session:
        async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                raise VoiceGenerationError(f"ElevenLabs voices API returned {resp.status}")
            data = await resp.json()

    raw_voices = data.get("voices", [])
    recommended_ids = set(RECOMMENDED_VOICES.keys())
    results = []

    for v in raw_voices:
        vid = v.get("voice_id", "")
        name = v.get("name", "")
        category = v.get("category", "")
        is_recommended = vid in recommended_ids
        rec_desc = RECOMMENDED_VOICES[vid]["description"] if is_recommended else ""
        label = f"⭐ {name} ({rec_desc})" if is_recommended else name

        results.append({
            "voice_id": vid,
            "name": label,
            "category": category or "general",
            "locale": "multilingual",
            "_recommended": is_recommended,
        })

    results.sort(key=lambda x: (not x["_recommended"], x["name"]))
    for r in results:
        r.pop("_recommended", None)

    return results
