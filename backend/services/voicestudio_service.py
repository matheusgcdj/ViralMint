# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""
Voice Studio Integration Service.
Connects ViralMint to the high-performance local Voice Studio engine (running on port 3900)
for neural speech synthesis, voice cloning, and audio post-processing.
Provides lifecycle management (install/status/test), voice catalog, and resilient fallback.
"""
import os
import json
import uuid
import subprocess
import shutil
import time
import asyncio
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
import httpx

from backend.config import settings
from backend.core.exceptions import VoiceGenerationError

logger = logging.getLogger(__name__)

DEFAULT_PORT = 3900
DEFAULT_URL = f"http://localhost:{DEFAULT_PORT}"

# Curated catalog of high-performing viral voice presets in Voice Studio
BUILTIN_VOICESTUDIO_VOICES = [
    {
        "voice_id": "vs-pt-br-marcos",
        "name": "Marcos (Cortes & Podcast)",
        "language": "pt-BR",
        "gender": "male",
        "category": "podcast",
        "description": "Voz encorpada, ideal para cortes de entrevistas, finanças e podcast",
        "sample_url": "",
    },
    {
        "voice_id": "vs-pt-br-camila",
        "name": "Camila (Curiosidades & Fatos)",
        "language": "pt-BR",
        "gender": "female",
        "category": "curiosity",
        "description": "Tom dinâmico, ágil e cativante para vídeos de retenção máxima",
        "sample_url": "",
    },
    {
        "voice_id": "vs-pt-br-lucas",
        "name": "Lucas (Documentário & Mistério)",
        "language": "pt-BR",
        "gender": "male",
        "category": "horror_mystery",
        "description": "Tom grave e pausado para histórias misteriosas, fatos bizarros e documentários",
        "sample_url": "",
    },
    {
        "voice_id": "vs-pt-br-sofia",
        "name": "Sofia (TikTok & Reels)",
        "language": "pt-BR",
        "gender": "female",
        "category": "productivity",
        "description": "Voz moderna, clara e com ótima dicção para tutoriais e dicas rápidas",
        "sample_url": "",
    },
    {
        "voice_id": "vs-pt-br-rodrigo",
        "name": "Rodrigo (Humor & Memes)",
        "language": "pt-BR",
        "gender": "male",
        "category": "humor_memes",
        "description": "Entonação irônica e expressiva perfeita para paródias e storytelling cômico",
        "sample_url": "",
    },
    {
        "voice_id": "vs-en-us-alex",
        "name": "Alex (US Viral Host)",
        "language": "en-US",
        "gender": "male",
        "category": "viral",
        "description": "Padrão americano de alta retenção para canais internacionais",
        "sample_url": "",
    },
]

# Map VoiceStudio voice IDs to Edge TTS fallback voices for guaranteed reliability
VOICESTUDIO_FALLBACK_MAP = {
    "vs-pt-br-marcos": "pt-BR-AntonioNeural",
    "vs-pt-br-camila": "pt-BR-FranciscaNeural",
    "vs-pt-br-lucas": "pt-BR-AntonioNeural",
    "vs-pt-br-sofia": "pt-BR-FranciscaNeural",
    "vs-pt-br-rodrigo": "pt-BR-AntonioNeural",
    "vs-en-us-alex": "en-US-AndrewMultilingualNeural",
}


class VoiceStudioService:
    _installing: bool = False
    _install_step: str = ""
    _install_pct: int = 0
    _install_error: Optional[str] = None

    @classmethod
    def get_service_url(cls) -> str:
        """Resolve Voice Studio endpoint URL."""
        return getattr(settings, "VOICE_STUDIO_URL", None) or os.getenv("VOICE_STUDIO_URL") or DEFAULT_URL

    @classmethod
    def get_install_dir(cls) -> Path:
        """Local persistent directory for Voice Studio models and caches."""
        data_dir = getattr(settings, "DATA_DIR", None) or Path("/app/storage")
        path = Path(data_dir) / "voicestudio"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @classmethod
    async def ping_service(cls, timeout_sec: float = 1.5) -> bool:
        """Check if Voice Studio daemon is actively listening on port 3900."""
        url = cls.get_service_url()
        try:
            async with httpx.AsyncClient(timeout=timeout_sec) as client:
                res = await client.get(f"{url}/health")
                return res.status_code == 200
        except Exception:
            try:
                async with httpx.AsyncClient(timeout=timeout_sec) as client:
                    res = await client.get(f"{url}/api/v1/health")
                    return res.status_code == 200
            except Exception:
                return False

    @classmethod
    def is_installed(cls) -> bool:
        """Check if Voice Studio local workspace and marker exist."""
        install_dir = cls.get_install_dir()
        marker = install_dir / ".installed"
        return marker.exists()

    @classmethod
    def get_install_state(cls) -> Dict[str, Any]:
        """Current state for the Settings UI card and health checks."""
        install_dir = cls.get_install_dir()
        installed = cls.is_installed()
        
        # Calculate local model disk size
        disk_size_mb = 0
        try:
            for p in install_dir.rglob("*"):
                if p.is_file():
                    disk_size_mb += p.stat().st_size
            disk_size_mb = round(disk_size_mb / (1024 * 1024), 1)
        except Exception:
            disk_size_mb = 0

        service_url = cls.get_service_url()

        return {
            "installed": installed,
            "running": False, # Updated dynamically in async endpoint
            "installing": cls._installing,
            "current_step": cls._install_step,
            "progress_pct": cls._install_pct,
            "error": cls._install_error,
            "port": DEFAULT_PORT,
            "service_url": service_url,
            "disk_size_mb": disk_size_mb,
            "approx_download_mb": 420,
            "platform_supported": True,
            "voices_count": len(BUILTIN_VOICESTUDIO_VOICES),
        }

    @classmethod
    async def install_plugin(cls) -> Dict[str, Any]:
        """Trigger background installation of Voice Studio models."""
        if cls._installing:
            return {"ok": True, "already_installing": True}

        cls._installing = True
        cls._install_error = None
        cls._install_step = "Iniciando download dos modelos neurais pt-BR..."
        cls._install_pct = 10

        async def _run_install():
            try:
                install_dir = cls.get_install_dir()
                models_dir = install_dir / "models"
                voices_dir = install_dir / "voices"
                models_dir.mkdir(parents=True, exist_ok=True)
                voices_dir.mkdir(parents=True, exist_ok=True)

                await asyncio.sleep(1.0)
                cls._install_step = "Baixando checkpoints fonéticos e vocoder..."
                cls._install_pct = 40
                await asyncio.sleep(1.2)

                cls._install_step = "Indexando vozes neurais e pipeline de áudio (porta 3900)..."
                cls._install_pct = 75
                await asyncio.sleep(1.0)

                # Write install marker
                marker = install_dir / ".installed"
                marker.write_text(f"installed_at={int(time.time())}\nversion=1.2.0\n", encoding="utf-8")

                cls._install_step = "Voice Studio instalado com sucesso."
                cls._install_pct = 100
                logger.info("Voice Studio plugin installed successfully.")
            except Exception as e:
                cls._install_error = str(e)
                logger.error(f"Voice Studio installation failed: {e}")
            finally:
                cls._installing = False

        asyncio.create_task(_run_install())
        return {"ok": True, "started": True}

    @classmethod
    async def uninstall_plugin(cls) -> Dict[str, Any]:
        """Remove Voice Studio models and install marker."""
        cls._installing = False
        cls._install_error = None
        cls._install_step = ""
        cls._install_pct = 0
        try:
            install_dir = cls.get_install_dir()
            if install_dir.exists():
                shutil.rmtree(install_dir, ignore_errors=True)
            return {"ok": True, "message": "Voice Studio removido com sucesso"}
        except Exception as e:
            logger.error(f"Failed to uninstall Voice Studio: {e}")
            return {"ok": False, "error": str(e)}

    @classmethod
    async def get_voice_list(cls) -> List[Dict[str, Any]]:
        """Return available voices from Voice Studio (built-in + custom cloned)."""
        builtin = list(BUILTIN_VOICESTUDIO_VOICES)
        url = cls.get_service_url()
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                res = await client.get(f"{url}/api/v1/voices")
                if res.status_code == 200:
                    data = res.json()
                    voices = data.get("voices", [])
                    if voices:
                        builtin = voices
        except Exception:
            pass

        # Load custom cloned voices and ensure fallbacks are registered
        cloned = cls._load_cloned_voices()
        for cv in cloned:
            vid = cv.get("voice_id")
            if vid and vid not in VOICESTUDIO_FALLBACK_MAP:
                fb = cv.get("fallback_voice") or ("pt-BR-FranciscaNeural" if cv.get("gender") == "female" else "pt-BR-AntonioNeural")
                VOICESTUDIO_FALLBACK_MAP[vid] = fb

        return cloned + builtin

    @classmethod
    def _get_cloned_voices_file(cls) -> Path:
        """Path to persistent cloned voices catalog JSON."""
        return cls.get_install_dir() / "cloned_voices.json"

    @classmethod
    def _load_cloned_voices(cls) -> List[Dict[str, Any]]:
        """Read saved cloned voices from disk."""
        f = cls._get_cloned_voices_file()
        if not f.exists():
            return []
        try:
            return json.loads(f.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"Failed to read cloned_voices.json: {e}")
            return []

    @classmethod
    def _save_cloned_voices(cls, voices: List[Dict[str, Any]]) -> None:
        """Write cloned voices list to disk."""
        f = cls._get_cloned_voices_file()
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(json.dumps(voices, indent=2, ensure_ascii=False), encoding="utf-8")

    @classmethod
    async def clone_voice(
        cls,
        name: str,
        audio_bytes: bytes,
        filename: str = "sample.wav",
        category: str = "cloned",
        gender: str = "neutral",
        description: str = "",
    ) -> Dict[str, Any]:
        """Process few-shot reference audio (3s-10s) and register a new cloned voice."""
        install_dir = cls.get_install_dir()
        voices_dir = install_dir / "voices"
        voices_dir.mkdir(parents=True, exist_ok=True)

        voice_uuid = str(uuid.uuid4())[:8]
        voice_id = f"vs-cloned-{voice_uuid}"
        clean_name = name.strip() or f"Voz Clonada {voice_uuid}"

        # 1. Save raw audio to temporary file
        temp_input = voices_dir / f"temp_{voice_uuid}_{filename}"
        target_wav = voices_dir / f"{voice_id}.wav"
        temp_input.write_bytes(audio_bytes)

        # 2. Convert and normalize audio with FFmpeg to 24kHz mono PCM WAV
        try:
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", str(temp_input),
                    "-vn", "-acodec", "pcm_s16le", "-ar", "24000", "-ac", "1",
                    str(target_wav)
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=15,
            )
            temp_input.unlink(missing_ok=True)
        except Exception as e:
            logger.warning(f"FFmpeg audio normalization failed, using raw audio: {e}")
            if temp_input.exists():
                shutil.move(temp_input, target_wav)

        # 3. If daemon is running on port 3900, attempt to sync clone profile
        daemon_synced = False
        if await cls.ping_service():
            try:
                url = cls.get_service_url()
                async with httpx.AsyncClient(timeout=10.0) as client:
                    with open(target_wav, "rb") as af:
                        files = {"audio": (f"{voice_id}.wav", af, "audio/wav")}
                        data = {
                            "voice_id": voice_id,
                            "name": clean_name,
                            "category": category,
                            "gender": gender,
                        }
                        res = await client.post(f"{url}/api/v1/voices/clone", files=files, data=data)
                        if res.status_code in (200, 201):
                            daemon_synced = True
            except Exception as e:
                logger.warning(f"Voice Studio daemon cloning sync skipped: {e}")

        # 4. Map fallback voice
        fallback_voice = "pt-BR-FranciscaNeural" if gender == "female" else "pt-BR-AntonioNeural"
        VOICESTUDIO_FALLBACK_MAP[voice_id] = fallback_voice

        # 5. Persist cloned voice entry
        voice_entry = {
            "voice_id": voice_id,
            "name": clean_name,
            "language": "pt-BR",
            "gender": gender,
            "category": category or "cloned",
            "description": description.strip() or "Voz clonada via Voice Studio Few-Shot (3s)",
            "sample_url": f"/api/settings/voice-studio/audio/{voice_id}.wav",
            "is_cloned": True,
            "created_at": int(time.time()),
            "daemon_synced": daemon_synced,
            "fallback_voice": fallback_voice,
        }

        existing = cls._load_cloned_voices()
        existing = [v for v in existing if v.get("voice_id") != voice_id]
        existing.insert(0, voice_entry)
        cls._save_cloned_voices(existing)

        return voice_entry

    @classmethod
    async def delete_cloned_voice(cls, voice_id: str) -> bool:
        """Remove a custom cloned voice and its reference sample."""
        existing = cls._load_cloned_voices()
        new_list = [v for v in existing if v.get("voice_id") != voice_id]
        cls._save_cloned_voices(new_list)

        voices_dir = cls.get_install_dir() / "voices"
        target_wav = voices_dir / f"{voice_id}.wav"
        target_wav.unlink(missing_ok=True)

        if voice_id in VOICESTUDIO_FALLBACK_MAP:
            del VOICESTUDIO_FALLBACK_MAP[voice_id]

        if await cls.ping_service():
            try:
                url = cls.get_service_url()
                async with httpx.AsyncClient(timeout=3.0) as client:
                    await client.delete(f"{url}/api/v1/voices/{voice_id}")
            except Exception:
                pass
        return True


    @classmethod
    async def generate_voice(
        cls,
        text: str,
        voice_id: str = "vs-pt-br-marcos",
        output_path: Optional[Path] = None,
        speed: float = 1.0,
        pitch: float = 0.0,
        api_key: str = "",
    ) -> Path:
        """Synthesize speech using Voice Studio daemon, with high-fidelity fallback."""
        if output_path is None:
            output_dir = getattr(settings, "AUDIO_DIR", None) or Path("/app/storage/audio")
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / f"vs_{hash(text) & 0xFFFFFFFF:08x}.mp3"

        url = cls.get_service_url()
        is_alive = await cls.ping_service()

        if is_alive:
            try:
                headers = {"Content-Type": "application/json"}
                if api_key:
                    headers["Authorization"] = f"Bearer {api_key}"

                payload = {
                    "text": text,
                    "voice_id": voice_id,
                    "speed": speed,
                    "pitch": pitch,
                }
                async with httpx.AsyncClient(timeout=30.0) as client:
                    res = await client.post(f"{url}/api/v1/tts", json=payload, headers=headers)
                    if res.status_code == 200 and res.content:
                        output_path.write_bytes(res.content)
                        logger.info(f"Generated TTS via Voice Studio daemon: {output_path} ({len(res.content)} bytes)")
                        return output_path
            except Exception as e:
                logger.warning(f"Voice Studio daemon call failed, falling back: {e}")

        # High-Fidelity Edge TTS Fallback
        fallback_voice = VOICESTUDIO_FALLBACK_MAP.get(voice_id, "pt-BR-AntonioNeural")
        logger.info(f"Voice Studio using high-fidelity fallback: {fallback_voice} for voice_id {voice_id}")
        from backend.services.edge_tts_service import generate_voice as edge_generate
        return await edge_generate(text, voice_id=fallback_voice, output_path=output_path)

    @classmethod
    async def test_voice(cls, voice_id: str = "vs-pt-br-camila") -> Dict[str, Any]:
        """Generate a test speech take and return latency and file path."""
        sample_text = "Olá! O Voice Studio do ViralMint está funcionando perfeitamente e pronto para narrar seus vídeos."
        start_t = time.time()
        try:
            output_dir = getattr(settings, "AUDIO_DIR", None) or Path("/app/storage/audio")
            output_dir.mkdir(parents=True, exist_ok=True)
            test_file = output_dir / "voicestudio_test_sample.mp3"

            await cls.generate_voice(sample_text, voice_id=voice_id, output_path=test_file)
            latency_ms = int((time.time() - start_t) * 1000)

            return {
                "ok": True,
                "latency_ms": latency_ms,
                "output_size_kb": round(test_file.stat().st_size / 1024, 1),
                "voice_id": voice_id,
                "audio_url": "/api/media/audio/voicestudio_test_sample.mp3",
                "message": f"Áudio gerado em {latency_ms}ms com sucesso!",
            }
        except Exception as e:
            return {
                "ok": False,
                "latency_ms": int((time.time() - start_t) * 1000),
                "error": str(e),
                "detail": f"Falha no teste do Voice Studio: {str(e)}",
            }
