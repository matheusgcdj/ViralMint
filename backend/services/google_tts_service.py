# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Google Text-to-Speech (Google Cloud TTS & Google AI Studio).

Supports high-quality neural voice synthesis through:
  1. Google Cloud Text-to-Speech API (Neural2, Studio, WaveNet, Standard)
  2. Google AI Studio (Gemini 2.0 Flash native multimodal audio synthesis)
  3. Google Cloud SDK (Service Account credentials via GOOGLE_APPLICATION_CREDENTIALS)

**Key pool support**: Multiple Google accounts can be pooled using
``GOOGLE_TTS_API_KEYS`` (comma-separated or one per line). The service
rotates through them using round-robin with automatic failover — when one key
hits quota limits (429), it enters a cooldown and the next key takes over
transparently. Single keys (``GOOGLE_TTS_API_KEY``) are also supported.

**Automatic Engine Fallback**:
If a key is from Google AI Studio (where Google Cloud Text-to-Speech API is
not activated by default in GCP), the service automatically detects this and
synthesizes speech using Google AI Studio Gemini audio generation.
"""
import asyncio
import base64
import hashlib
import json
import logging
import os
import shutil
import subprocess
import time
import weakref
from pathlib import Path
from typing import Optional

from backend.config import settings
from backend.core.exceptions import VoiceGenerationError

logger = logging.getLogger(__name__)

# ── Voice catalog ─────────────────────────────────────────────────────────────
# Curated set of high-quality voices for Google Cloud and Google AI Studio.
RECOMMENDED_VOICES = {
    # pt-BR — Google Cloud Neural2 & WaveNet
    "pt-BR-Neural2-A": {"name": "Ana (Neural2 · Cloud)", "gender": "female", "locale": "pt-BR"},
    "pt-BR-Neural2-B": {"name": "Bruno (Neural2 · Cloud)", "gender": "male", "locale": "pt-BR"},
    "pt-BR-Neural2-C": {"name": "Clara (Neural2 · Cloud)", "gender": "female", "locale": "pt-BR"},
    "pt-BR-Standard-A": {"name": "Ana (Standard · Cloud)", "gender": "female", "locale": "pt-BR"},
    "pt-BR-Standard-B": {"name": "Bruno (Standard · Cloud)", "gender": "male", "locale": "pt-BR"},
    "pt-BR-Wavenet-A": {"name": "Ana (WaveNet · Cloud)", "gender": "female", "locale": "pt-BR"},
    "pt-BR-Wavenet-B": {"name": "Bruno (WaveNet · Cloud)", "gender": "male", "locale": "pt-BR"},
    # Google AI Studio — Gemini Multilingual Voices (Puck, Charon, Kore, Fenrir, Aoede)
    "gemini-Puck": {"name": "Puck (Gemini · AI Studio)", "gender": "neutral", "locale": "multilingual"},
    "gemini-Charon": {"name": "Charon (Gemini · AI Studio)", "gender": "male", "locale": "multilingual"},
    "gemini-Kore": {"name": "Kore (Gemini · AI Studio)", "gender": "female", "locale": "multilingual"},
    "gemini-Fenrir": {"name": "Fenrir (Gemini · AI Studio)", "gender": "male", "locale": "multilingual"},
    "gemini-Aoede": {"name": "Aoede (Gemini · AI Studio)", "gender": "female", "locale": "multilingual"},
    # en-US — Google Cloud
    "en-US-Neural2-A": {"name": "Aria (Neural2 · Cloud)", "gender": "male", "locale": "en-US"},
    "en-US-Neural2-C": {"name": "Chris (Neural2 · Cloud)", "gender": "male", "locale": "en-US"},
    "en-US-Neural2-E": {"name": "Emily (Neural2 · Cloud)", "gender": "female", "locale": "en-US"},
    "en-US-Neural2-F": {"name": "Fiona (Neural2 · Cloud)", "gender": "female", "locale": "en-US"},
    "en-US-Neural2-J": {"name": "James (Neural2 · Cloud)", "gender": "male", "locale": "en-US"},
    "en-US-Studio-O": {"name": "Oliver (Studio · Cloud)", "gender": "male", "locale": "en-US"},
    "en-US-Studio-Q": {"name": "Quinn (Studio · Cloud)", "gender": "female", "locale": "en-US"},
    # es-US / es-ES
    "es-US-Neural2-A": {"name": "Ana (Neural2 · Cloud)", "gender": "female", "locale": "es-US"},
    "es-US-Neural2-B": {"name": "Bruno (Neural2 · Cloud)", "gender": "male", "locale": "es-US"},
    "es-US-Neural2-C": {"name": "Carlos (Neural2 · Cloud)", "gender": "male", "locale": "es-US"},
    # fr-FR
    "fr-FR-Neural2-A": {"name": "Alice (Neural2 · Cloud)", "gender": "female", "locale": "fr-FR"},
    "fr-FR-Neural2-D": {"name": "David (Neural2 · Cloud)", "gender": "male", "locale": "fr-FR"},
    # ja-JP
    "ja-JP-Neural2-B": {"name": "Hana (Neural2 · Cloud)", "gender": "female", "locale": "ja-JP"},
    "ja-JP-Neural2-C": {"name": "Kenji (Neural2 · Cloud)", "gender": "male", "locale": "ja-JP"},
    # ko-KR
    "ko-KR-Neural2-A": {"name": "Jiyoung (Neural2 · Cloud)", "gender": "female", "locale": "ko-KR"},
    "ko-KR-Neural2-C": {"name": "Minho (Neural2 · Cloud)", "gender": "male", "locale": "ko-KR"},
}

DEFAULT_VOICE = "pt-BR-Neural2-B"

# Max concurrent requests
_MAX_CONCURRENT = 3
_semaphore_map: weakref.WeakValueDictionary = weakref.WeakValueDictionary()


def _get_semaphore() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    sem = _semaphore_map.get(id(loop))
    if sem is None:
        sem = asyncio.Semaphore(_MAX_CONCURRENT)
        _semaphore_map[id(loop)] = sem
    return sem


# ── Internal Exceptions ───────────────────────────────────────────────────────

class _QuotaExhaustedError(Exception):
    """Raised when an API key hits quota or rate limit — triggers pool failover."""
    pass


class _ServiceDisabledError(Exception):
    """Raised when an API endpoint is not enabled for a key — triggers engine switch."""
    pass


# ── API Key Pool (round-robin with failover) ──────────────────────────────────

class _KeyPool:
    """Thread-safe round-robin key pool with automatic failover."""

    _QUOTA_COOLDOWN = 3600  # 1 hour cooldown when quota is exhausted

    def __init__(self):
        self._keys: list[str] = []
        self._index = 0
        self._lock = asyncio.Lock()
        self._exhausted: dict[str, float] = {}

    def configure(self, keys: list[str]):
        seen: set[str] = set()
        unique: list[str] = []
        for k in keys:
            k = k.strip()
            if k and k not in seen:
                unique.append(k)
                seen.add(k)
        self._keys = unique
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
        if not self._keys:
            raise VoiceGenerationError(
                "Google TTS not configured. Set GOOGLE_TTS_API_KEY or "
                "GOOGLE_TTS_API_KEYS in .env or Settings."
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
                    f"All {n} Google TTS key(s) are quota-exhausted. "
                    f"Next key recovers in ~{max(1, int(wait / 60))} minutes."
                )
            raise VoiceGenerationError("Google TTS key pool is empty")

    def mark_exhausted(self, key: str):
        self._exhausted[key] = time.monotonic()
        healthy = sum(1 for k in self._keys if self._is_healthy(k))
        logger.warning(
            "Google TTS key ...%s marked exhausted. %d/%d keys remaining.",
            key[-6:], healthy, len(self._keys),
        )

    def pool_status(self) -> dict:
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
    keys: list[str] = []
    try:
        from backend.core.crypto import decrypt
        from backend.database import engine
        from sqlalchemy import text
        with engine.sync_engine.connect() as sync_conn:
            row = sync_conn.execute(
                text("SELECT google_tts_api_keys_encrypted FROM user_settings WHERE user_id = 'local' LIMIT 1")
            ).fetchone()
            if row and row[0]:
                dec = decrypt(row[0])
                if dec:
                    keys = [k.strip() for k in dec.replace("\n", ",").split(",") if k.strip()]
    except Exception:
        pass

    if not keys:
        multi = getattr(settings, "GOOGLE_TTS_API_KEYS", "") or ""
        if multi:
            keys = [k.strip() for k in multi.replace("\n", ",").split(",") if k.strip()]

    if not keys:
        single = getattr(settings, "GOOGLE_TTS_API_KEY", "") or ""
        if single.strip():
            keys = [single.strip()]

    _key_pool.configure(keys)


_init_key_pool()


def get_key_pool_status() -> dict:
    return _key_pool.pool_status()


def reconfigure_key_pool(keys: list[str]):
    cleaned: list[str] = []
    for k in keys:
        for sub in k.replace("\n", ",").split(","):
            sub = sub.strip()
            if sub:
                cleaned.append(sub)
    _key_pool.configure(cleaned)


# ── Audio conversion helper ───────────────────────────────────────────────────

def _pcm_or_wav_to_mp3(audio_bytes: bytes, mime_type: str, output_path: Path):
    """Ensure audio bytes are written as standard MP3."""
    if "mp3" in mime_type:
        output_path.write_bytes(audio_bytes)
        return

    ffmpeg_bin = shutil.which("ffmpeg") or "ffmpeg"
    if "pcm" in mime_type:
        rate = "24000"
        if "rate=" in mime_type:
            try:
                rate = mime_type.split("rate=")[1].split(";")[0].strip()
            except Exception:
                rate = "24000"
        cmd = [
            ffmpeg_bin, "-y", "-f", "s16le", "-ar", rate, "-ac", "1",
            "-i", "pipe:0", "-codec:a", "libmp3lame", "-qscale:a", "2", str(output_path),
        ]
    else:
        cmd = [
            ffmpeg_bin, "-y", "-i", "pipe:0", "-codec:a", "libmp3lame", "-qscale:a", "2", str(output_path),
        ]

    proc = subprocess.run(cmd, input=audio_bytes, capture_output=True)
    if proc.returncode != 0:
        raise VoiceGenerationError(
            f"FFmpeg conversion to MP3 failed: {proc.stderr.decode(errors='ignore')[:250]}"
        )


# ── REST API Path: Google Cloud Text-to-Speech ────────────────────────────────

_CLOUD_TTS_REST_URL = "https://texttospeech.googleapis.com/v1/text:synthesize"


async def _synthesize_cloud_rest(
    text: str,
    voice_id: str,
    api_key: str,
    output_path: Path,
    speaking_rate: float = 1.0,
    pitch: float = 0.0,
) -> Path:
    """Synthesize speech via Google Cloud Text-to-Speech REST API."""
    import aiohttp

    parts = voice_id.split("-")
    language_code = "-".join(parts[:2]) if len(parts) >= 3 else "pt-BR"

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

    url = f"{_CLOUD_TTS_REST_URL}?key={api_key}"

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as resp:
            body = await resp.text()
            if resp.status in (429, 403):
                lower = body.lower()
                if resp.status == 429 or "quota" in lower or "resource_exhausted" in lower or "rate" in lower:
                    raise _QuotaExhaustedError(
                        f"Key ...{api_key[-6:]}: HTTP {resp.status}: {body[:200]}"
                    )
                if (
                    "has not been used in project" in lower
                    or "service_disabled" in lower
                    or "disabled" in lower
                    or "blocked" in lower
                    or "access_not_configured" in lower
                ):
                    raise _ServiceDisabledError(
                        f"Google Cloud TTS API not enabled on key ...{api_key[-6:]}: {body[:200]}"
                    )
                raise VoiceGenerationError(f"Google Cloud TTS API error ({resp.status}): {body[:300]}")
            if resp.status != 200:
                raise VoiceGenerationError(f"Google Cloud TTS API error ({resp.status}): {body[:300]}")
            data = json.loads(body)

    audio_b64 = data.get("audioContent", "")
    if not audio_b64:
        raise VoiceGenerationError("Google Cloud TTS returned empty audio content")

    audio_bytes = base64.b64decode(audio_b64)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(audio_bytes)

    if output_path.stat().st_size == 0:
        raise VoiceGenerationError("Google Cloud TTS wrote an empty file")

    return output_path


# ── REST API Path: Google AI Studio (Gemini 2.0 Flash Audio) ──────────────────

_AI_STUDIO_REST_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


async def _synthesize_gemini_ai_studio(
    text: str,
    voice_name: str,
    api_key: str,
    output_path: Path,
) -> Path:
    """Synthesize speech using Google AI Studio (Gemini 2.0 Flash native audio output)."""
    import aiohttp

    clean_voice = voice_name.replace("gemini-", "").capitalize()
    if clean_voice not in ("Puck", "Charon", "Kore", "Fenrir", "Aoede"):
        lower = voice_name.lower()
        if any(f in lower for f in ("female", "-a", "-c", "-e", "-f", "ana", "clara", "emily", "kore", "aoede")):
            clean_voice = "Kore"
        else:
            clean_voice = "Charon"

    url = f"{_AI_STUDIO_REST_URL}?key={api_key}"
    prompt = (
        "Por favor, leia em voz alta o seguinte texto exatamente como escrito, "
        "com pronúncia clara, tom natural e excelente dicção. "
        "Fale APENAS as palavras do texto, sem nenhuma introdução, prefixo ou comentário adicional:\n\n"
        f"{text}"
    )

    payload = {
        "contents": [{
            "role": "user",
            "parts": [{"text": prompt}],
        }],
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {
                    "prebuiltVoiceConfig": {
                        "voiceName": clean_voice,
                    }
                }
            },
        },
    }

    async with aiohttp.ClientSession() as session:
        async with session.post(url, json=payload, timeout=aiohttp.ClientTimeout(total=60)) as resp:
            body = await resp.text()
            if resp.status in (429, 403):
                lower = body.lower()
                if resp.status == 429 or "quota" in lower or "resource_exhausted" in lower or "rate" in lower:
                    raise _QuotaExhaustedError(
                        f"Key ...{api_key[-6:]}: HTTP {resp.status}: {body[:200]}"
                    )
                if (
                    "disabled" in lower
                    or "not been used in project" in lower
                    or "blocked" in lower
                    or "service_disabled" in lower
                    or "access_not_configured" in lower
                ):
                    raise _ServiceDisabledError(
                        f"Google AI Studio not enabled on key ...{api_key[-6:]}: {body[:200]}"
                    )
                raise VoiceGenerationError(f"Google AI Studio API error ({resp.status}): {body[:300]}")
            if resp.status != 200:
                raise VoiceGenerationError(f"Google AI Studio API error ({resp.status}): {body[:300]}")
            data = json.loads(body)

    candidates = data.get("candidates", [])
    if not candidates:
        raise VoiceGenerationError("Google AI Studio returned no candidates in response")

    parts = candidates[0].get("content", {}).get("parts", [])
    audio_part = next((p for p in parts if "inlineData" in p), None)
    if not audio_part:
        raise VoiceGenerationError("Google AI Studio did not return audio inlineData")

    inline_data = audio_part["inlineData"]
    mime_type = inline_data.get("mimeType", "audio/wav")
    audio_b64 = inline_data.get("data", "")
    if not audio_b64:
        raise VoiceGenerationError("Google AI Studio audio content is empty")

    audio_bytes = base64.b64decode(audio_b64)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    _pcm_or_wav_to_mp3(audio_bytes, mime_type, output_path)

    if output_path.stat().st_size == 0:
        raise VoiceGenerationError("Google AI Studio generated an empty audio file")

    return output_path


# ── Unified Synthesizer with Engine Switching ─────────────────────────────────

async def _synthesize_with_key(
    text: str,
    voice_id: str,
    api_key: str,
    output_path: Path,
    speaking_rate: float = 1.0,
    pitch: float = 0.0,
) -> Path:
    """Synthesize speech using either Google Cloud TTS or Google AI Studio.

    Automatically handles both types of keys:
    1. If a Gemini voice is requested (or voice starts with 'gemini-'):
       Calls Google AI Studio. If AI Studio is disabled, falls back to Cloud TTS.
    2. If a Google Cloud voice is requested:
       Calls Google Cloud TTS. If Cloud TTS is disabled (e.g. key from AI Studio
       without Cloud Text-to-Speech enabled in GCP), falls back to Google AI Studio.
    """
    is_gemini_voice = (
        voice_id.startswith("gemini-")
        or voice_id.lower() in ("puck", "charon", "kore", "fenrir", "aoede")
    )

    if is_gemini_voice:
        try:
            return await _synthesize_gemini_ai_studio(text, voice_id, api_key, output_path)
        except _ServiceDisabledError as e:
            logger.info(
                "Google AI Studio not enabled for key ...%s (%s), trying Google Cloud TTS fallback",
                api_key[-6:], e,
            )
            return await _synthesize_cloud_rest(
                text, DEFAULT_VOICE, api_key, output_path, speaking_rate, pitch
            )
    else:
        try:
            return await _synthesize_cloud_rest(
                text, voice_id, api_key, output_path, speaking_rate, pitch
            )
        except _ServiceDisabledError as e:
            logger.info(
                "Google Cloud TTS not enabled for key ...%s (%s), automatically switching to Google AI Studio Gemini TTS",
                api_key[-6:], e,
            )
            return await _synthesize_gemini_ai_studio(text, voice_id, api_key, output_path)


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
        language_code = "-".join(parts[:2]) if len(parts) >= 3 else "pt-BR"

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
    speaking_rate: float = 1.0,
    pitch: float = 0.0,
) -> Path:
    """Generate speech using Google Cloud TTS or Google AI Studio.

    Key selection strategy:
    1. If ``api_key`` is comma/newline separated -> treat as ad-hoc pool.
    2. If ``api_key`` is a single key -> use it directly.
    3. If ``api_key`` is empty -> use key pool (DB settings or .env).
    4. If no keys at all + ``GOOGLE_APPLICATION_CREDENTIALS`` -> SDK path.
    5. Nothing -> raise VoiceGenerationError.
    """
    if output_path is None:
        h = hashlib.sha256(f"google_tts|{voice_id}|{text}".encode()).hexdigest()[:16]
        output_path = settings.AUDIO_DIR / f"google_{h}.mp3"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    sem = _get_semaphore()

    # Case 1-2: Explicit key(s) passed by caller
    if api_key:
        explicit_keys = [k.strip() for k in api_key.replace("\n", ",").split(",") if k.strip()]
        if len(explicit_keys) > 1:
            last_err = None
            async with sem:
                for k in explicit_keys:
                    try:
                        result = await _synthesize_with_key(
                            text, voice_id, k, output_path, speaking_rate, pitch
                        )
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
        elif len(explicit_keys) == 1:
            async with sem:
                result = await _synthesize_with_key(
                    text, voice_id, explicit_keys[0], output_path, speaking_rate, pitch
                )
            logger.info(
                "Google TTS generated: %s (%dKB, voice=%s)",
                result, result.stat().st_size // 1024, voice_id,
            )
            return result

    # Case 3: Module-level key pool
    if _key_pool.has_keys:
        max_attempts = _key_pool.size
        last_err = None
        for attempt in range(max_attempts):
            key = await _key_pool.acquire()
            try:
                async with sem:
                    result = await _synthesize_with_key(
                        text, voice_id, key, output_path, speaking_rate, pitch
                    )
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
            result = await _synthesize_sdk(text, voice_id, output_path, speaking_rate, pitch)
        logger.info(
            "Google TTS generated (SDK): %s (%dKB, voice=%s)",
            result, result.stat().st_size // 1024, voice_id,
        )
        return result

    # Case 5: Nothing configured
    raise VoiceGenerationError(
        "Google TTS not configured. Set GOOGLE_TTS_API_KEY (single) or "
        "GOOGLE_TTS_API_KEYS (pool of accounts) in .env or Settings, "
        "or set GOOGLE_APPLICATION_CREDENTIALS for the Cloud SDK."
    )


async def get_voice_list(api_key: str = "") -> list[dict]:
    """Return available Google TTS and Google AI Studio voices."""
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
            logger.debug("Failed to fetch Google TTS voices from API, using curated list")

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
    """Fetch voices from Google Cloud Text-to-Speech API and append AI Studio voices."""
    import aiohttp

    url = f"https://texttospeech.googleapis.com/v1/voices?key={api_key}"

    async with aiohttp.ClientSession() as session:
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as resp:
            if resp.status != 200:
                raise VoiceGenerationError(f"Google TTS voices API returned {resp.status}")
            data = await resp.json()

    raw_voices = data.get("voices", [])

    recommended_ids = set(RECOMMENDED_VOICES.keys())
    results = []

    # First add AI Studio voices
    for vid, info in RECOMMENDED_VOICES.items():
        if vid.startswith("gemini-"):
            results.append({
                "voice_id": vid,
                "name": f"⭐ {info['name']}",
                "category": info["gender"],
                "locale": info["locale"],
            })

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

    results.sort(key=lambda x: (not x.get("_recommended", False), x.get("locale", ""), x.get("voice_id", "")))
    for r in results:
        r.pop("_recommended", None)

    return results
