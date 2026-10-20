# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Groq Whisper transcription — cloud-hosted, ultra-fast STT via Groq's API.

Groq runs Whisper large-v3 on their LPU hardware, returning transcriptions
~10× faster than real time. Free tier gives generous daily minutes; paid
tier is $0.111 per audio hour. No local model download, no GPU required.

This module plugs into WhisperService as an alternative backend alongside
the local faster-whisper engine.
"""
import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Groq's Whisper endpoint supports these models. `whisper-large-v3-turbo`
# is the fast default; `whisper-large-v3` is full precision, slower but
# marginally more accurate on noisy audio.
GROQ_WHISPER_MODELS = {
    "fast":     "whisper-large-v3-turbo",
    "accurate": "whisper-large-v3",
}
DEFAULT_GROQ_MODEL = "whisper-large-v3-turbo"

# Groq's API limits audio to 25 MB per request. Files above this need
# chunking (not implemented yet — falls back to local whisper).
_MAX_FILE_SIZE_MB = 25


async def groq_transcribe(
    audio_path: str | Path,
    api_key: str,
    language: Optional[str] = None,
    model: str = DEFAULT_GROQ_MODEL,
    word_timestamps: bool = True,
) -> dict:
    """Transcribe audio via Groq's Whisper API.

    Returns the same dict shape as WhisperService.transcribe():
    ``{"text": "...", "language": "en", "language_probability": 1.0,
       "segments": [{"start", "end", "text", "words": [...]}]}``.

    Raises ``GroqTranscriptionError`` on failure.
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    file_size_mb = audio_path.stat().st_size / (1024 * 1024)
    if file_size_mb > _MAX_FILE_SIZE_MB:
        raise GroqTranscriptionError(
            f"Audio file too large for Groq API ({file_size_mb:.1f} MB, "
            f"max {_MAX_FILE_SIZE_MB} MB). Use local Whisper for long audio."
        )

    def _call_groq():
        from groq import Groq

        client = Groq(api_key=api_key)

        with open(audio_path, "rb") as f:
            # Request verbose JSON to get word-level timestamps and segments
            response = client.audio.transcriptions.create(
                file=(audio_path.name, f),
                model=model,
                response_format="verbose_json",
                language=language or None,
                timestamp_granularities=["word", "segment"] if word_timestamps else ["segment"],
            )

        return response

    try:
        response = await asyncio.to_thread(_call_groq)
    except Exception as e:
        error_msg = str(e)[:300] or type(e).__name__
        logger.error("Groq Whisper transcription failed: %s", error_msg)
        raise GroqTranscriptionError(f"Groq transcription failed: {error_msg}") from e

    # Normalise Groq's response to match faster-whisper's output format.
    text = getattr(response, "text", "") or ""
    detected_language = getattr(response, "language", None) or language or "en"

    raw_segments = getattr(response, "segments", None) or []
    raw_words = getattr(response, "words", None) or []

    # Build a word index keyed by segment for quick lookup
    segments = []
    for seg in raw_segments:
        seg_start = float(seg.get("start", 0) if isinstance(seg, dict) else getattr(seg, "start", 0))
        seg_end = float(seg.get("end", 0) if isinstance(seg, dict) else getattr(seg, "end", 0))
        seg_text = (seg.get("text", "") if isinstance(seg, dict) else getattr(seg, "text", "")).strip()

        # Collect words that fall within this segment's time range
        seg_words = []
        for w in raw_words:
            w_start = float(w.get("start", 0) if isinstance(w, dict) else getattr(w, "start", 0))
            w_end = float(w.get("end", 0) if isinstance(w, dict) else getattr(w, "end", 0))
            w_word = (w.get("word", "") if isinstance(w, dict) else getattr(w, "word", ""))
            # Word belongs to this segment if it starts within the segment bounds
            if seg_start <= w_start < seg_end + 0.5:
                seg_words.append({
                    "word": w_word,
                    "start": w_start,
                    "end": w_end,
                    "probability": 1.0,  # Groq doesn't return per-word confidence
                })

        segments.append({
            "start": seg_start,
            "end": seg_end,
            "text": seg_text,
            "words": seg_words,
        })

    # If no segments came back but we have text, create a single segment
    if not segments and text:
        segments = [{
            "start": 0.0,
            "end": getattr(response, "duration", 0.0) or 0.0,
            "text": text.strip(),
            "words": [{
                "word": w.get("word", "") if isinstance(w, dict) else getattr(w, "word", ""),
                "start": float(w.get("start", 0) if isinstance(w, dict) else getattr(w, "start", 0)),
                "end": float(w.get("end", 0) if isinstance(w, dict) else getattr(w, "end", 0)),
                "probability": 1.0,
            } for w in raw_words],
        }]

    logger.info(
        "Groq Whisper transcribed %s: %d segments, %.1fs, lang=%s",
        audio_path.name, len(segments),
        segments[-1]["end"] if segments else 0,
        detected_language,
    )

    return {
        "text": text,
        "language": detected_language,
        "language_probability": 1.0,  # Groq doesn't expose this
        "segments": segments,
    }


class GroqTranscriptionError(Exception):
    """Raised when Groq Whisper transcription fails."""
