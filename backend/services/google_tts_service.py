# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Google Cloud Text-to-Speech — high-quality neural voices with a generous free tier.

Google TTS gives 1 million characters/month free on Standard voices and
1 million characters/month free on WaveNet, plus Neural2 and Studio voices
at very low cost. The pool of voices across languages is massive — ideal for
multi-nicho content factories.

**Key pool support**: When you have multiple Google Cloud accounts (e.g. 7
accounts = 7M free characters/month), set ``GOOGLE_TTS_API_KEYS`` as a
comma-separated list of API keys. The service rotates through them using
round-robin with automatic failover — when one key hits its quota, the
next key takes over transparently. A single ``GOOGLE_TTS_API_KEY`` still
works for backwards compatibility.

Requires either:
  * ``GOOGLE_TTS_API_KEY``  — a single API key (simplest).
  * ``GOOGLE_TTS_API_KEYS`` — comma-separated pool (e.g. 7 accounts).
  * ``GOOGLE_APPLICATION_CREDENTIALS`` — a service account JSON path for
    the google-cloud-texttospeech SDK (more features, streaming, SSML).

This module implements BOTH paths: REST API with plain key (zero dependency),
and the Google Cloud SDK when installed AND credentials are present.
"""
import asyncio
import hashlib
import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

from backend.config import settings
from backend.core.exceptions import VoiceGenerationError

logger = logging.getLogger(__name__)

# ── Voice catalog ─────────────────────────────────────────────────────────────
# Curated set of high-quality voices for the picker. The full catalog has
# 700+ entries — we surface the most natural ones per locale and let the
# user type any voice name in the free-text field.
RECOMMENDED_VOICES = {
    # pt-BR — priority for ViralMint's Brazilian user base
    "pt-BR-Neural2-A": {"name": "Ana (Neural2)", "gender": "female", "locale": "pt-BR"},
    "pt-BR-Neural2-B": {"name": "Bruno (Neural2)", "gender": "male", "locale": "pt-BR"},
    "pt-BR-Neural2-C": {"name": "Clara (Neural2)", "gender": "female", "locale": "pt-BR"},
    "pt-BR-Standard-A": {"name": "Ana (Standard)", "gender": "female", "locale": "pt-BR"},
    "pt-BR-Standard-B": {"name": "Bruno (Standard)", "gender": "male", "locale": "pt-BR"},
    "pt-BR-Wavenet-A": {"name": "Ana (WaveNet)", "gender": "female", "locale": "pt-BR"},
    "pt-BR-Wavenet-B": {"name": "Bruno (WaveNet)", "gender": "male", "locale": "pt-BR"},
    # en-US
    "en-US-Neural2-A": {"name": "Aria (Neural2)", "gender": "male", "locale": "en-US"},
    "en-US-Neural2-C": {"name": "Chris (Neural2)", "gender": "male", "locale": "en-US"},
    "en-US-Neural2-E": {"name": "Emily (Neural2)", "gender": "female", "locale": "en-US"},
    "en-US-Neural2-F": {"name": "Fiona (Neural2)", "gender": "female", "locale": "en-US"},
    "en-US-Neural2-J": {"name": "James (Neural2)", "gender": "male", "locale": "en-US"},
    "en-US-Studio-O": {"name": "Oliver (Studio)", "gender": "male", "locale": "en-US"},
    "en-US-Studio-Q": {"name": "Quinn (Studio)", "gender": "female", "locale": "en-US"},
    # es-US / es-ES
    "es-US-Neural2-A": {"name": "Ana (Neural2)", "gender": "female", "locale": "es-US"},
    "es-US-Neural2-B": {"name": "Bruno (Neural2)", "gender": "male", "locale": "es-US"},
    "es-US-Neural2-C": {"name": "Carlos (Neural2)", "gender": "male", "locale": "es-US"},
    # fr-FR
    "fr-FR-Neural2-A": {"name": "Alice (Neural2)", "gender": "female", "locale": "fr-FR"},
    "fr-FR-Neural2-D": {"name": "David (Neural2)", "gender": "male", "locale": "fr-FR"},
    # ja-JP
    "ja-JP-Neural2-B": {"name": "Hana (Neural2)", "gender": "female", "locale": "ja-JP"},
    "ja-JP-Neural2-C": {"name": "Kenji (Neural2)", "gender": "male", "locale": "ja-JP"},
    # ko-KR
    "ko-KR-Neural2-A": {"name": "Jiyoung (Neural2)", "gender": "female", "locale": "ko-KR"},
    "ko-KR-Neural2-C": {"name": "Minho (Neural2)", "gender": "male", "locale": "ko-KR"},
}

DEFAULT_VOICE = "pt-BR-Neural2-B"

# Max concurrent Google TTS requests (network I/O, not CPU)
_MAX_CONCURRENT = 3

# ── Semaphore pool (per-loop, same pattern as edge_tts_service) ───────────────
import weakref
_semaphore_map: weakref.WeakValueDictionary = weakref.WeakValueDictionary()


def _get_semaphore() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    sem = _semaphore_map.get(id(loop))
    if sem is None:
        sem = asyncio.Semaphore(_MAX_CONCURRENT)
        _semaphore_map[id(loop)] = sem
    return sem


# ── API Key Pool (round-robin with failover) ──────────────────────────────────
# Supports multiple Google Cloud accounts to combine free tier quotas.
# Example: 7 accounts × 1M chars/month = 7M chars/month free.

class _KeyPool:
    """Thread-safe round-robin key pool with automatic failover.

    When a key returns 429 (quota exceeded) or 403 (disabled), it's marked
    as exhausted for a cooldown period. The next call picks the next healthy
    key. When ALL keys are exhausted, the pool waits for the earliest
    cooldown to expire.
    """

    # How long a key stays "exhausted" before retrying (seconds).
    _QUOTA_COOLDOWN = 3600  # 1 hour — Google resets quota hourly

    def __init__(self):
        self._keys: list[str] = []
        self._index = 0
        self._lock = asyncio.Lock()
        # Maps key -> monotonic timestamp when it was marked exhausted
        self._exhausted: dict[str, float] = {}

    def configure(self, keys: list[str]):
        """Set the key pool. Called once at module init or when settings change."""
        # Deduplicate while preserving order
        seen: set[str] = set()
        unique: list[str] = []
        for k in keys:
            k = k.strip()
            if k and k not in seen:
                unique.append(k)
                seen.add(k)
        self._keys = unique
        # Prune exhausted entries for removed keys
        self._exhausted = {k: t for k, t in self._exhausted.items() if k in seen}
        logger.info("Google TTS key pool configured: %d key(s)", len(unique))

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
        """Return the next healthy API key (round-robin).

        Raises VoiceGenerationError if the pool is empty or all keys are
        exhausted and none will recover soon.
        """
        if not self._keys:
            raise VoiceGenerationError(
                "Google TTS not configured. Set GOOGLE_TTS_API_KEY or "
                "GOOGLE_TTS_API_KEYS in .env or Settings."
            )

        async with self._lock:
            n = len(self._keys)
            # Try each key once from the current index
            for _ in range(n):
                key = self._keys[self._index % n]
                self._index = (self._index + 1) % n
                if self._is_healthy(key):
                    return key

            # All keys exhausted — find the one that recovers soonest
            soonest_key = min(
                self._exhausted,
                key=lambda k: self._exhausted[k],
                default=None,
            )
            if soonest_key:
                wait = self._QUOTA_COOLDOWN - (time.monotonic() - self._exhausted[soonest_key])
                raise VoiceGenerationError(
                    f"All {n} Google TTS key(s) are quota-exhausted. "
                    f"Next key recovers in ~{max(1, int(wait / 60))} minutes."
                )
            raise VoiceGenerationError("Google TTS key pool is empty")

    def mark_exhausted(self, key: str):
        """Mark a key as temporarily unusable (quota hit or disabled)."""
        self._exhausted[key] = time.monotonic()
        healthy = sum(1 for k in self._keys if self._is_healthy(k))
        logger.warning(
            "Google TTS key ...%s marked exhausted. %d/%d keys remaining.",
            key[-6:], healthy, len(self._keys),
        )

    def pool_status(self) -> dict:
        """Return pool health info for the health dashboard."""
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


# Module-level singleton
_key_pool = _KeyPool()


def _init_key_pool():
    """Initialize the key pool from settings. Supports both single and multi-key."""
    keys: list[str] = []

    # Multi-key takes precedence (comma-separated)
    multi = getattr(settings, "GOOGLE_TTS_API_KEYS", "") or ""
    if multi:
        keys = [k.strip() for k in multi.split(",") if k.strip()]

    # Fall back to single key
    if not keys:
        single = getattr(settings, "GOOGLE_TTS_API_KEY", "") or ""
        if single.strip():
            keys = [single.strip()]

    _key_pool.configure(keys)


# Run on import so the pool is ready
_init_key_pool()


def get_key_pool_status() -> dict:
    """Public accessor for the health dashboard."""
    return _key_pool.pool_status()


def reconfigure_key_pool(keys: list[str]):
    """Reconfigure the key pool at runtime (e.g. from Settings UI).

    Also accepts a single comma-separated string.
    """
    if len(keys) == 1 and "," in keys[0]:
        keys = [k.strip() for k in keys[0].split(",") if k.strip()]
    _key_pool.configure(keys)


# ── REST API path (simple API key, no SDK dependency) ─────────────────────────

_TTS_REST_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"


class _QuotaExhaustedError(Exception):
    """Raised when a single key hits its quota — triggers pool failover."""
    pass


async def _synthesize_rest(
    text: str,
    voice_id: str,
    api_key: str,
    output_path: Path,
    speaking_rate: float = 1.0,
    pitch: float = 0.0,
) -> Path:
    """Synthesize speech via Google TTS REST API (no SDK needed).

    Raises ``_QuotaExhaustedError`` on 429/403 so the caller can fail over
    to the next key in the pool.
    """
    import aiohttp
    import base64

    # Parse locale from voice name (e.g. "pt-BR-Neural2-B" -> "pt-BR")
    parts = voice_id.split("-")
    language_code = "-".join(parts[:2]) if len(parts) >= 3 else "en-US"

    payload = {
        "input": {"text": text},
        "voice": {
            "languageCode": language_code,
            "name": voice_id,
        },
        "audioConfig": {
            "audioEncoding": "MP3",
            "speakingRate": speaking_rate,
            "pitch": pitch,
        },
    }

    url = f"{_TTS_REST_URL}?key={api_key}"

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as resp:
            if resp.status in (429, 403):
                body = await resp.text()
                # Check if it's truly a quota/disabled error (not an auth error
                # on a wrong key, which would be "API key not valid")
                lower = body.lower()
                if "quota" in lower or "rate" in lower or "disabled" in lower or resp.status == 429:
                    raise _QuotaExhaustedError(
                        f"Key ...{api_key[-6:]}: HTTP {resp.status}: {body[:200]}"
                    )
                raise VoiceGenerationError(
                    f"Google TTS API error ({resp.status}): {body[:300]}"
                )
            if resp.status != 200:
                body = await resp.text()
                raise VoiceGenerationError(
                    f"Google TTS API error ({resp.status}): {body[:300]}"
                )
            data = await resp.json()

    audio_b64 = data.get("audioContent", "")
    if not audio_b64:
        raise VoiceGenerationError("Google TTS returned empty audio content")

    audio_bytes = base64.b64decode(audio_b64)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(audio_bytes)

    if output_path.stat().st_size == 0:
        raise VoiceGenerationError("Google TTS wrote an empty file")

    return output_path


# ── SDK path (service account credentials) ────────────────────────────────────

async def _synthesize_sdk(
    text: str,
    voice_id: str,
    output_path: Path,
    speaking_rate: float = 1.0,
    pitch: float = 0.0,
) -> Path:
    """Synthesize speech via the google-cloud-texttospeech SDK."""

    def _run():
        from google.cloud import texttospeech

        client = texttospeech.TextToSpeechClient()

        parts = voice_id.split("-")
        language_code = "-".join(parts[:2]) if len(parts) >= 3 else "en-US"

        synthesis_input = texttospeech.SynthesisInput(text=text)
        voice = texttospeech.VoiceSelectionParams(
            language_code=language_code,
            name=voice_id,
        )
        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=speaking_rate,
            pitch=pitch,
        )

        response = client.synthesize_speech(
            input=synthesis_input, voice=voice, audio_config=audio_config
        )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(response.audio_content)
        return output_path

    return await asyncio.to_thread(_run)


# ── Public interface ──────────────────────────────────────────────────────────

async def generate_voice(
    text: str,
    voice_id: str = DEFAULT_VOICE,
    api_key: str = "",
    output_path: Optional[Path] = None,
) -> Path:
    """Generate speech using Google Cloud TTS. Returns audio file path.

    Key selection strategy:
    1. If ``api_key`` is a comma-separated list → treat as an ad-hoc pool.
    2. If ``api_key`` is a single key → use it directly (no rotation).
    3. If ``api_key`` is empty → use the module-level key pool (configured
       from ``GOOGLE_TTS_API_KEYS`` / ``GOOGLE_TTS_API_KEY`` in .env).
    4. If no keys at all + ``GOOGLE_APPLICATION_CREDENTIALS`` → SDK path.
    5. Nothing → raise VoiceGenerationError.
    """
    if output_path is None:
        h = hashlib.sha256(f"google_tts|{voice_id}|{text}".encode()).hexdigest()[:16]
        output_path = settings.AUDIO_DIR / f"google_{h}.mp3"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    sem = _get_semaphore()

    # Case 1-2: Explicit key(s) passed by caller
    if api_key:
        explicit_keys = [k.strip() for k in api_key.split(",") if k.strip()]
        if len(explicit_keys) > 1:
            # Ad-hoc pool — try each key in order
            last_err = None
            async with sem:
                for k in explicit_keys:
                    try:
                        result = await _synthesize_rest(text, voice_id, k, output_path)
                        logger.info(
                            "Google TTS generated: %s (%dKB, voice=%s, key=...%s)",
                            result, result.stat().st_size // 1024, voice_id, k[-6:],
                        )
                        return result
                    except _QuotaExhaustedError as e:
                        logger.warning("Google TTS key failover: %s", e)
                        last_err = e
                        continue
            raise VoiceGenerationError(
                f"All {len(explicit_keys)} Google TTS key(s) exhausted: {last_err}"
            )
        else:
            # Single explicit key
            async with sem:
                result = await _synthesize_rest(text, voice_id, explicit_keys[0], output_path)
            logger.info(
                "Google TTS generated: %s (%dKB, voice=%s)",
                result, result.stat().st_size // 1024, voice_id,
            )
            return result

    # Case 3: Module-level key pool (GOOGLE_TTS_API_KEYS / GOOGLE_TTS_API_KEY)
    if _key_pool.has_keys:
        max_attempts = _key_pool.size
        last_err = None
        for attempt in range(max_attempts):
            key = await _key_pool.acquire()
            try:
                async with sem:
                    result = await _synthesize_rest(text, voice_id, key, output_path)
                logger.info(
                    "Google TTS generated: %s (%dKB, voice=%s, pool key %d/%d)",
                    result, result.stat().st_size // 1024, voice_id,
                    attempt + 1, _key_pool.size,
                )
                return result
            except _QuotaExhaustedError as e:
                _key_pool.mark_exhausted(key)
                last_err = e
                continue
        raise VoiceGenerationError(
            f"All {_key_pool.size} Google TTS pool key(s) exhausted: {last_err}"
        )

    # Case 4: Google Cloud SDK (service account)
    if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
        async with sem:
            result = await _synthesize_sdk(text, voice_id, output_path)
        logger.info(
            "Google TTS generated (SDK): %s (%dKB, voice=%s)",
            result, result.stat().st_size // 1024, voice_id,
        )
        return result

    # Case 5: Nothing configured
    raise VoiceGenerationError(
        "Google TTS not configured. Set GOOGLE_TTS_API_KEY (single) or "
        "GOOGLE_TTS_API_KEYS (comma-separated pool of multiple accounts) "
        "in .env or Settings, or set GOOGLE_APPLICATION_CREDENTIALS for "
        "the Cloud SDK."
    )


async def get_voice_list(api_key: str = "") -> list[dict]:
    """Return available Google TTS voices.

    Uses the REST API to fetch the full catalog when an API key is available;
    otherwise returns the curated RECOMMENDED_VOICES list.
    """
    # Resolve a key for the API call: explicit > pool > none
    effective_key = api_key
    if not effective_key and _key_pool.has_keys:
        try:
            effective_key = await _key_pool.acquire()
        except VoiceGenerationError:
            pass  # All exhausted; fall through to curated list

    if effective_key:
        # If it's a comma-separated list, use the first one
        if "," in effective_key:
            effective_key = effective_key.split(",")[0].strip()
        try:
            return await _fetch_voices_from_api(effective_key)
        except Exception:
            logger.debug("Failed to fetch Google TTS voices from API, using curated list")

    # Curated fallback — always available, no network needed
    voices = []
    for voice_id, info in RECOMMENDED_VOICES.items():
        voices.append({
            "voice_id": voice_id,
            "name": f"⭐ {info['name']}",
            "category": info["gender"],
            "locale": info["locale"],
        })
    return voices


async def _fetch_voices_from_api(api_key: str) -> list[dict]:
    """Fetch the full voice catalog from Google's TTS API."""
    import aiohttp

    url = f"https://texttospeech.googleapis.com/v1/voices?key={api_key}"

    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                raise VoiceGenerationError(f"Google TTS voices API returned {resp.status}")
            data = await resp.json()

    raw_voices = data.get("voices", [])

    # Prioritise recommended voices (star emoji), then sort by locale
    recommended_ids = set(RECOMMENDED_VOICES.keys())
    results = []
    for v in raw_voices:
        vid = v.get("name", "")
        codes = v.get("languageCodes", [])
        locale = codes[0] if codes else ""
        gender = (v.get("ssmlGender", "") or "").lower()
        is_recommended = vid in recommended_ids

        results.append({
            "voice_id": vid,
            "name": f"{'⭐ ' if is_recommended else ''}{vid}",
            "category": gender,
            "locale": locale,
            "_recommended": is_recommended,
        })

    # Recommended first, then alphabetical
    results.sort(key=lambda x: (not x["_recommended"], x["locale"], x["voice_id"]))
    for r in results:
        r.pop("_recommended", None)

    return results
