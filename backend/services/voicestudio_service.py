# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""
Voice Studio Integration Service.
Connects ViralMint to the high-performance local Voice Studio engine (debpalash/voicestudio, port 3900)
for neural speech synthesis, few-shot voice cloning, and audio post-processing.
Provides lifecycle management, voice catalog synchronization, and transparent fallback behavior.
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

# Map VoiceStudio built-in preset voice IDs to Edge TTS fallback voices
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
    _resolved_url: Optional[str] = None

    @classmethod
    def get_service_url(cls) -> str:
        """Resolve Voice Studio endpoint URL, supporting Docker container and localhost routing."""
        if cls._resolved_url:
            return cls._resolved_url
        configured = getattr(settings, "VOICE_STUDIO_URL", None) or os.getenv("VOICE_STUDIO_URL")
        if configured:
            return configured.rstrip("/")
        return DEFAULT_URL

    @classmethod
    def _get_headers(cls) -> Dict[str, str]:
        """Prepare authentication headers for Voice Studio (debpalash/voicestudio)."""
        headers = {}
        api_key = (
            getattr(settings, "VOICE_STUDIO_API_KEY", "")
            or os.getenv("VOICE_STUDIO_API_KEY")
            or os.getenv("OMNIVOICE_API_KEY")
            or ""
        ).strip()
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
            headers["X-API-Key"] = api_key
        return headers

    @classmethod
    def get_install_dir(cls) -> Path:
        """Local persistent directory for Voice Studio models, references, and caches."""
        data_dir = getattr(settings, "DATA_DIR", None) or Path("/app/storage")
        path = Path(data_dir) / "voicestudio"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @classmethod
    async def ping_service(cls, timeout_sec: float = 2.0) -> bool:
        """Check if Voice Studio daemon is actively listening and responsive."""
        primary_url = cls.get_service_url()
        candidates = [primary_url]

        # In Docker Compose, container name 'voicestudio' resolves via DNS.
        # When running outside Docker, 'localhost:3900' is typical.
        if "localhost" in primary_url or "127.0.0.1" in primary_url:
            candidates.append("http://voicestudio:3900")
        elif "voicestudio" in primary_url:
            candidates.append(f"http://localhost:{DEFAULT_PORT}")

        headers = cls._get_headers()
        for candidate_url in candidates:
            try:
                async with httpx.AsyncClient(timeout=timeout_sec) as client:
                    res = await client.get(f"{candidate_url}/health", headers=headers)
                    if res.status_code == 200:
                        cls._resolved_url = candidate_url
                        asyncio.create_task(cls.ensure_license_accepted())
                        return True
            except Exception:
                continue

        return False


    _license_ensured: bool = False

    @classmethod
    async def ensure_license_accepted(cls) -> bool:
        """Auto-accept OmniVoice model license in Voice Studio daemon if needed."""
        if cls._license_ensured:
            return True
        url = cls.get_service_url()
        headers = cls._get_headers()
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                repo_id = "k2-fsa/OmniVoice"
                res = await client.get(f"{url}/models/licenses/details/{repo_id}", headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    if data.get("accepted"):
                        cls._license_ensured = True
                        return True
                    fp = data.get("fingerprint") or ""
                    if fp:
                        accept_res = await client.post(
                            f"{url}/models/licenses/accept",
                            json={"repo_id": repo_id, "fingerprint": fp, "accepted": True},
                            headers=headers,
                        )
                        if accept_res.status_code in (200, 201):
                            logger.info("Auto-accepted OmniVoice model license in VoiceStudio")
                            cls._license_ensured = True
                            return True
        except Exception as e:
            logger.debug(f"OmniVoice license acceptance check: {e}")
        return False

    @classmethod
    def is_installed(cls) -> bool:
        """Check if Voice Studio local workspace or marker exists."""
        install_dir = cls.get_install_dir()
        marker = install_dir / ".installed"
        return marker.exists()

    @classmethod
    def get_install_state(cls) -> Dict[str, Any]:
        """Current state for the Settings UI card and health checks."""
        install_dir = cls.get_install_dir()
        installed = cls.is_installed()

        # Calculate local model & voice sample disk size
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
            "running": False,  # Updated dynamically in async endpoint
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
        """Initialize Voice Studio directories and check container readiness."""
        if cls._installing:
            return {"ok": True, "already_installing": True}

        cls._installing = True
        cls._install_error = None
        cls._install_step = "Inicializando diretórios do Voice Studio..."
        cls._install_pct = 20

        try:
            install_dir = cls.get_install_dir()
            models_dir = install_dir / "models"
            voices_dir = install_dir / "voices"
            models_dir.mkdir(parents=True, exist_ok=True)
            voices_dir.mkdir(parents=True, exist_ok=True)

            cls._install_step = "Verificando conexão com o container Voice Studio (porta 3900)..."
            cls._install_pct = 60

            is_running = await cls.ping_service(timeout_sec=3.0)

            # Write install marker
            marker = install_dir / ".installed"
            marker.write_text(f"installed_at={int(time.time())}\nversion=2.0.0\n", encoding="utf-8")

            cls._install_pct = 100
            if is_running:
                cls._install_step = "Voice Studio conectado e operacional na porta 3900."
            else:
                cls._install_step = (
                    "Diretórios prontos. Certifique-se de que o container 'voicestudio' "
                    "(ghcr.io/debpalash/voicestudio:stable) está em execução."
                )
            logger.info("Voice Studio initialized successfully.")
            return {"ok": True, "running": is_running, "message": cls._install_step}
        except Exception as e:
            cls._install_error = str(e)
            logger.error(f"Voice Studio initialization failed: {e}")
            return {"ok": False, "error": str(e)}
        finally:
            cls._installing = False

    @classmethod
    async def uninstall_plugin(cls) -> Dict[str, Any]:
        """Remove Voice Studio models and install marker."""
        cls._installing = False
        cls._install_error = None
        cls._install_step = ""
        cls._install_pct = 0
        try:
            install_dir = cls.get_install_dir()
            marker = install_dir / ".installed"
            marker.unlink(missing_ok=True)
            return {"ok": True, "message": "Voice Studio desvinculado com sucesso"}
        except Exception as e:
            logger.error(f"Failed to reset Voice Studio: {e}")
            return {"ok": False, "error": str(e)}

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
    async def get_voice_list(cls) -> List[Dict[str, Any]]:
        """Return available voices (custom cloned + remote VoiceStudio profiles + builtin presets)."""
        url = cls.get_service_url()
        headers = cls._get_headers()

        # 1. Fetch remote profiles registered directly in Voice Studio
        remote_profiles: List[Dict[str, Any]] = []
        if await cls.ping_service():
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    res = await client.get(f"{url}/profiles", headers=headers)
                    if res.status_code == 200:
                        profiles = res.json()
                        if isinstance(profiles, list):
                            for p in profiles:
                                p_id = p.get("id")
                                p_name = p.get("name") or f"Perfil {p_id}"
                                remote_profiles.append({
                                    "voice_id": f"vs-remote-{p_id}",
                                    "vs_profile_id": p_id,
                                    "name": f"✨ {p_name}",
                                    "language": p.get("language") or "pt-BR",
                                    "gender": p.get("personality") or "neutral",
                                    "category": p.get("kind") or "cloned",
                                    "description": f"Perfil Voice Studio ({p.get('kind', 'neural')})",
                                    "sample_url": f"{url}/profiles/{p_id}/audio" if p.get("audio_url") else "",
                                    "is_cloned": True,
                                })
            except Exception as e:
                logger.debug(f"Could not fetch remote profiles from Voice Studio: {e}")

        # 2. Load locally registered cloned voices
        cloned = cls._load_cloned_voices()

        # 3. Merge voices, prioritizing locally cloned voices, then remote profiles, then built-in presets
        seen_keys = set()
        result: List[Dict[str, Any]] = []

        for cv in cloned:
            vid = cv.get("voice_id")
            vs_pid = cv.get("vs_profile_id")
            if vid and vid not in seen_keys:
                seen_keys.add(vid)
                if vs_pid:
                    seen_keys.add(vs_pid)
                    seen_keys.add(f"vs-remote-{vs_pid}")
                result.append(cv)

        for rp in remote_profiles:
            vs_pid = rp.get("vs_profile_id")
            vid = rp.get("voice_id")
            if vs_pid not in seen_keys and vid not in seen_keys:
                seen_keys.add(vs_pid)
                seen_keys.add(vid)
                result.append(rp)

        for bv in BUILTIN_VOICESTUDIO_VOICES:
            vid = bv.get("voice_id")
            if vid not in seen_keys:
                seen_keys.add(vid)
                result.append(bv)

        return result

    @classmethod
    async def _transcribe_reference_audio(cls, wav_path: Path) -> str:
        """Transcribe reference audio clip using ViralMint's Whisper/Groq service."""
        try:
            from backend.services.whisper_service import whisper_service
            tx = await whisper_service.transcribe(str(wav_path), backend="auto")
            res_text = (tx.get("text") or "").strip()
            if res_text:
                logger.info(f"Auto-transcribed reference audio ({wav_path.name}): {res_text[:60]}")
                return res_text
        except Exception as e:
            logger.warning(f"Auto-transcribe of reference audio {wav_path.name} failed: {e}")
        return "Olá, esta é a gravação de referência da minha voz para calibração neural em língua portuguesa."

    @classmethod
    async def clone_voice(
        cls,
        name: str,
        audio_bytes: bytes,
        filename: str = "sample.wav",
        ref_text: str = "",
        category: str = "cloned",
        gender: str = "neutral",
        description: str = "",
    ) -> Dict[str, Any]:
        """Process few-shot reference audio (3s-10s) and register voice in Voice Studio (debpalash/voicestudio)."""
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
                timeout=20,
            )
            temp_input.unlink(missing_ok=True)
        except Exception as e:
            logger.warning(f"FFmpeg audio normalization failed, using raw audio: {e}")
            if temp_input.exists():
                shutil.move(temp_input, target_wav)

        # 2.5 Resolve reference text for zero-shot conditioning (auto-transcribing if empty)
        clean_ref_text = (ref_text or "").strip()
        if not clean_ref_text:
            clean_ref_text = await cls._transcribe_reference_audio(target_wav)

        # 3. If VoiceStudio daemon is running, sync clone profile via POST /profiles
        daemon_synced = False
        vs_profile_id = None
        if await cls.ping_service():
            try:
                url = cls.get_service_url()
                headers = cls._get_headers()
                async with httpx.AsyncClient(timeout=35.0) as client:
                    with open(target_wav, "rb") as af:
                        files = {"ref_audio": (f"{voice_id}.wav", af, "audio/wav")}
                        data = {
                            "name": clean_name,
                            "kind": "clone",
                            "language": "pt",
                            "ref_text": clean_ref_text,
                            "instruct": "",
                        }
                        res = await client.post(f"{url}/profiles", data=data, files=files, headers=headers)
                        if res.status_code in (200, 201):
                            profile_json = res.json()
                            vs_profile_id = profile_json.get("id")
                            daemon_synced = True
                            logger.info(f"Synchronized cloned voice with VoiceStudio profile: id={vs_profile_id}")
                        else:
                            logger.warning(f"VoiceStudio POST /profiles returned {res.status_code}: {res.text[:200]}")
            except Exception as e:
                logger.warning(f"Voice Studio daemon profile registration deferred: {e}")

        # 4. Map fallback voice identifier (used only if explicitly permitted)
        fallback_voice = "pt-BR-FranciscaNeural" if gender == "female" else "pt-BR-AntonioNeural"
        VOICESTUDIO_FALLBACK_MAP[voice_id] = fallback_voice

        # 5. Persist cloned voice entry
        voice_entry = {
            "voice_id": voice_id,
            "vs_profile_id": vs_profile_id,
            "name": clean_name,
            "ref_text": clean_ref_text,
            "language": "pt-BR",
            "gender": gender,
            "category": category or "cloned",
            "description": description.strip() or "Voz clonada via Voice Studio Few-Shot",
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
        """Remove a custom cloned voice, local reference audio, and remote profile."""
        existing = cls._load_cloned_voices()
        target_entry = next((v for v in existing if v.get("voice_id") == voice_id), None)
        new_list = [v for v in existing if v.get("voice_id") != voice_id]
        cls._save_cloned_voices(new_list)

        voices_dir = cls.get_install_dir() / "voices"
        target_wav = voices_dir / f"{voice_id}.wav"
        target_wav.unlink(missing_ok=True)

        if voice_id in VOICESTUDIO_FALLBACK_MAP:
            del VOICESTUDIO_FALLBACK_MAP[voice_id]

        # Delete profile in VoiceStudio daemon if running
        if await cls.ping_service():
            vs_profile_id = target_entry.get("vs_profile_id") if target_entry else None
            # Also handle if voice_id itself was the remote profile id
            remote_id = vs_profile_id or (voice_id[len("vs-remote-"):] if voice_id.startswith("vs-remote-") else None)
            if remote_id:
                try:
                    url = cls.get_service_url()
                    headers = cls._get_headers()
                    async with httpx.AsyncClient(timeout=5.0) as client:
                        await client.delete(f"{url}/profiles/{remote_id}", headers=headers)
                except Exception as e:
                    logger.debug(f"Voice Studio remote profile delete ignored: {e}")
        return True

    @classmethod
    def _save_and_convert_audio(cls, raw_bytes: bytes, target_path: Path) -> None:
        """Save received WAV audio bytes and convert to target format (e.g. MP3) with FFmpeg."""
        target_path.parent.mkdir(parents=True, exist_ok=True)
        if target_path.suffix.lower() == ".wav":
            target_path.write_bytes(raw_bytes)
            return

        # Target is MP3 or another container format
        temp_wav = target_path.with_suffix(f".tmp_{uuid.uuid4().hex[:6]}.wav")
        try:
            temp_wav.write_bytes(raw_bytes)
            subprocess.run(
                [
                    "ffmpeg", "-y", "-i", str(temp_wav),
                    "-vn", "-ar", "44100", "-ac", "2", "-b:a", "192k",
                    str(target_path)
                ],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=30,
            )
        except Exception as e:
            logger.warning(f"FFmpeg conversion to {target_path.suffix} failed ({e}), saving raw bytes directly")
            target_path.write_bytes(raw_bytes)
        finally:
            temp_wav.unlink(missing_ok=True)

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
        """
        Synthesize speech using Voice Studio neural engine (debpalash/voicestudio).
        For cloned voices, ensures true neural synthesis or raises clear operational errors.
        For built-in presets, uses Edge TTS fallback when daemon is offline.
        """
        if output_path is None:
            output_dir = getattr(settings, "AUDIO_DIR", None) or Path("/app/storage/audio")
            output_dir.mkdir(parents=True, exist_ok=True)
            output_path = output_dir / f"vs_{hash(text) & 0xFFFFFFFF:08x}.mp3"

        # Check if the requested voice is a cloned voice
        cloned_list = cls._load_cloned_voices()
        cloned_entry = next(
            (
                v for v in cloned_list
                if v.get("voice_id") == voice_id
                or v.get("vs_profile_id") == voice_id
                or (voice_id.startswith("vs-remote-") and v.get("vs_profile_id") == voice_id[len("vs-remote-"):])
            ),
            None
        )
        is_cloned = (cloned_entry is not None) or voice_id.startswith("vs-cloned-") or voice_id.startswith("vs-remote-")

        url = cls.get_service_url()
        headers = cls._get_headers()
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        is_alive = await cls.ping_service()

        if is_alive:
            try:
                # ── Route Cloned Voice Synthesis ──
                if is_cloned:
                    vs_profile_id = cloned_entry.get("vs_profile_id") if cloned_entry else None
                    if not vs_profile_id and voice_id.startswith("vs-remote-"):
                        vs_profile_id = voice_id[len("vs-remote-"):]

                    voices_dir = cls.get_install_dir() / "voices"
                    ref_wav = voices_dir / f"{cloned_entry.get('voice_id', voice_id)}.wav" if cloned_entry else None

                    # Resolve reference transcript
                    ref_text = (cloned_entry.get("ref_text") if cloned_entry else "") or ""
                    if not ref_text and ref_wav and ref_wav.exists():
                        ref_text = await cls._transcribe_reference_audio(ref_wav)
                        if cloned_entry:
                            cloned_entry["ref_text"] = ref_text
                            cls._save_cloned_voices(cloned_list)
                    if not ref_text:
                        ref_text = "Olá, esta é a gravação de referência da minha voz para calibração neural em língua portuguesa."

                    # If profile was not registered in Voice Studio daemon yet, attempt just-in-time sync
                    if not vs_profile_id and ref_wav and ref_wav.exists():
                        try:
                            async with httpx.AsyncClient(timeout=30.0) as sync_client:
                                with open(ref_wav, "rb") as af:
                                    files = {"ref_audio": (ref_wav.name, af, "audio/wav")}
                                    data = {
                                        "name": cloned_entry.get("name", voice_id) if cloned_entry else voice_id,
                                        "kind": "clone",
                                        "language": "pt",
                                        "ref_text": ref_text,
                                    }
                                    res_sync = await sync_client.post(
                                        f"{url}/profiles", data=data, files=files, headers=headers
                                    )
                                    if res_sync.status_code in (200, 201):
                                        vs_profile_id = res_sync.json().get("id")
                                        if cloned_entry:
                                            cloned_entry["vs_profile_id"] = vs_profile_id
                                            cloned_entry["daemon_synced"] = True
                                            cls._save_cloned_voices(cloned_list)
                        except Exception as e:
                            logger.warning(f"Just-in-time VoiceStudio profile sync error: {e}")

                    # If profile is registered, update ref_text on remote profile if missing
                    if vs_profile_id and ref_text:
                        try:
                            async with httpx.AsyncClient(timeout=10.0) as update_client:
                                await update_client.put(
                                    f"{url}/profiles/{vs_profile_id}",
                                    json={"ref_text": ref_text, "language": "pt"},
                                    headers=headers,
                                )
                        except Exception:
                            pass

                    # Dispatch generation: prefer profile_id, fallback to direct ref_audio upload
                    res = None
                    async with httpx.AsyncClient(timeout=300.0) as client:
                        if vs_profile_id:
                            form_data = {
                                "text": text,
                                "profile_id": vs_profile_id,
                                "ref_text": ref_text,
                                "speed": str(speed),
                                "language": "pt",
                                "num_step": "8",
                                "postprocess_output": "false",
                            }
                            res = await client.post(f"{url}/generate", data=form_data, headers=headers)
                        elif ref_wav and ref_wav.exists():
                            with open(ref_wav, "rb") as af:
                                files = {"ref_audio": (ref_wav.name, af, "audio/wav")}
                                form_data = {
                                    "text": text,
                                    "ref_text": ref_text,
                                    "speed": str(speed),
                                    "language": "pt",
                                    "num_step": "8",
                                    "postprocess_output": "false",
                                }
                                res = await client.post(f"{url}/generate", data=form_data, files=files, headers=headers)
                        else:
                            raise VoiceGenerationError(
                                f"Amostra de áudio de referência da voz clonada '{voice_id}' não foi encontrada."
                            )

                        if res and res.status_code == 200 and res.content:
                            cls._save_and_convert_audio(res.content, output_path)
                            logger.info(f"Synthesized cloned voice via Voice Studio: {output_path} ({len(res.content)} bytes)")
                            return output_path

                        # OpenAI-compatible fallback (/v1/audio/speech)
                        if vs_profile_id:
                            try:
                                openai_payload = {
                                    "model": "omnivoice",
                                    "input": text,
                                    "voice": vs_profile_id,
                                    "response_format": "mp3",
                                    "speed": speed,
                                }
                                res_oa = await client.post(f"{url}/v1/audio/speech", json=openai_payload, headers=headers)
                                if res_oa.status_code == 200 and res_oa.content:
                                    output_path.write_bytes(res_oa.content)
                                    logger.info(f"Synthesized cloned voice via Voice Studio /v1/audio/speech: {output_path}")
                                    return output_path
                            except Exception as e_oa:
                                logger.debug(f"OpenAI-compat fallback error: {e_oa}")

                        error_detail = res.text[:300] if (res and res.text) else f"status {res.status_code if res else 'unknown'}"
                        raise VoiceGenerationError(
                            f"Voice Studio recusou a síntese: {error_detail}"
                        )

                # ── Route Preset Voice Synthesis ──
                else:
                    form_data = {
                        "text": text,
                        "speed": str(speed),
                        "language": "pt",
                        "num_step": "8",
                        "postprocess_output": "false",
                    }
                    async with httpx.AsyncClient(timeout=120.0) as client:
                        res = await client.post(f"{url}/generate", data=form_data, headers=headers)
                        if res.status_code == 200 and res.content:
                            cls._save_and_convert_audio(res.content, output_path)
                            logger.info(f"Synthesized preset voice via Voice Studio: {output_path}")
                            return output_path

            except Exception as e:
                err_msg = str(e).strip() or type(e).__name__
                if isinstance(e, (httpx.TimeoutException, asyncio.TimeoutError)):
                    err_msg = "Tempo limite esgotado (timeout) durante o processamento de áudio"
                logger.error(f"Voice Studio daemon execution failed: {err_msg}")
                if is_cloned:
                    # Never mask cloned voices with Antonio/Francisca
                    raise VoiceGenerationError(
                        f"Falha na síntese neural da voz clonada: {err_msg}. "
                        "Verifique os logs do container 'voicestudio'."
                    )

        # ── Handle Offline Daemon or Built-in Preset Fallback ──
        if is_cloned:
            voice_label = cloned_entry.get("name") if cloned_entry else voice_id
            raise VoiceGenerationError(
                f"O container Voice Studio (porta 3900) não está respondendo. "
                f"Para sintetizar a voz clonada '{voice_label}', certifique-se de que o serviço "
                "'voicestudio' (ghcr.io/debpalash/voicestudio:stable) está ativo no Docker."
            )

        # High-Fidelity Edge TTS Fallback for built-in generic presets
        fallback_voice = VOICESTUDIO_FALLBACK_MAP.get(voice_id, "pt-BR-AntonioNeural")
        logger.info(f"Voice Studio using Edge TTS fallback: {fallback_voice} for voice_id {voice_id}")
        from backend.services.edge_tts_service import generate_voice as edge_generate
        return await edge_generate(text, voice_id=fallback_voice, output_path=output_path)

    @classmethod
    async def test_voice(cls, voice_id: str = "vs-pt-br-camila") -> Dict[str, Any]:
        """Generate a test speech take and return latency and file path."""
        sample_text = (
            "Olá! O Voice Studio do ViralMint está funcionando perfeitamente "
            "e pronto para narrar seus vídeos com alta retenção."
        )
        start_t = time.time()
        try:
            output_dir = getattr(settings, "AUDIO_DIR", None) or Path("/app/storage/audio")
            output_dir.mkdir(parents=True, exist_ok=True)
            test_file = output_dir / f"voicestudio_test_{uuid.uuid4().hex[:6]}.mp3"

            await cls.generate_voice(sample_text, voice_id=voice_id, output_path=test_file)
            latency_ms = int((time.time() - start_t) * 1000)

            return {
                "ok": True,
                "latency_ms": latency_ms,
                "output_size_kb": round(test_file.stat().st_size / 1024, 1),
                "voice_id": voice_id,
                "audio_url": f"/api/settings/voice-studio/audio/{test_file.name}",
                "message": f"Áudio gerado em {latency_ms}ms com sucesso!",
            }
        except Exception as e:
            return {
                "ok": False,
                "latency_ms": int((time.time() - start_t) * 1000),
                "error": str(e),
                "detail": f"Falha no teste do Voice Studio: {str(e)}",
            }
