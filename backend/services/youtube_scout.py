# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""YouTube Data API v3 search for trending videos with dynamic ordering and multi-lingual detection."""
import json
import logging
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger(__name__)


async def search_youtube(
    niche: str,
    api_key: str = "",
    credentials_json: str = "",
    max_results: int = 50,
    order: str = "relevance",
    time_window_days: int = 5,
    video_duration: str = "any",
) -> list[dict]:
    """
    Search YouTube for trending videos in a niche using API Key or OAuth credentials.
    Supports dynamic ordering (relevance, date, viewCount), configurable time windows,
    and video duration filters ('short' <4m, 'medium' 4-20m, 'long' >20m, or 'any').
    Returns list of raw video dicts with metadata.
    """
    import asyncio
    from googleapiclient.discovery import build

    def _search():
        if credentials_json:
            try:
                from google.oauth2.credentials import Credentials
                creds_data = json.loads(credentials_json) if isinstance(credentials_json, str) else credentials_json
                creds = Credentials(
                    token=creds_data.get("token"),
                    refresh_token=creds_data.get("refresh_token"),
                    token_uri=creds_data.get("token_uri", "https://oauth2.googleapis.com/token"),
                    client_id=creds_data.get("client_id"),
                    client_secret=creds_data.get("client_secret"),
                )
                youtube = build("youtube", "v3", credentials=creds)
            except Exception as oauth_err:
                logger.warning(f"Failed to initialize YouTube service from OAuth credentials: {oauth_err}")
                if api_key:
                    youtube = build("youtube", "v3", developerKey=api_key)
                else:
                    raise
        elif api_key:
            youtube = build("youtube", "v3", developerKey=api_key)
        else:
            raise ValueError("Neither YouTube API key nor OAuth credentials provided.")

        # Detect language from the query to set relevanceLanguage
        lang = _detect_language(niche)

        # Prepare search params
        search_kwargs = {
            "q": niche,
            "part": "id,snippet",
            "type": "video",
            "order": order if order in ("relevance", "date", "viewCount", "rating") else "relevance",
            "maxResults": min(max_results, 50),
            "publishedAfter": _get_recent_date(days=time_window_days),
        }
        if lang:
            search_kwargs["relevanceLanguage"] = lang

        if video_duration in ("short", "medium", "long"):
            search_kwargs["videoDuration"] = video_duration

        # Search for relevant videos
        search_response = youtube.search().list(**search_kwargs).execute()

        video_ids = [
            item["id"]["videoId"]
            for item in search_response.get("items", [])
            if item["id"].get("videoId")
        ]

        if not video_ids:
            return []

        # Get detailed stats for each video
        videos_response = youtube.videos().list(
            part="snippet,statistics,contentDetails",
            id=",".join(video_ids),
        ).execute()

        results = []
        for item in videos_response.get("items", []):
            snippet = item["snippet"]
            stats = item.get("statistics", {})
            video_id = item["id"]

            results.append({
                "platform": "youtube",
                "video_id": video_id,
                "video_url": f"https://youtube.com/watch?v={video_id}",
                "embed_url": f"https://www.youtube-nocookie.com/embed/{video_id}",
                "title": snippet.get("title", ""),
                "description": snippet.get("description", "")[:500],
                "author": snippet.get("channelTitle", ""),
                "author_url": f"https://youtube.com/channel/{snippet.get('channelId', '')}",
                "thumbnail_url": snippet.get("thumbnails", {}).get("high", {}).get("url", "")
                or snippet.get("thumbnails", {}).get("default", {}).get("url", "")
                or f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
                "views": int(stats.get("viewCount", 0)),
                "likes": int(stats.get("likeCount", 0)),
                "comments": int(stats.get("commentCount", 0)),
                "shares": 0,
                "duration_seconds": _parse_duration(item.get("contentDetails", {}).get("duration", "")),
                "upload_date": _parse_date(snippet.get("publishedAt")),
            })

        return results

    return await asyncio.to_thread(_search)


def _detect_language(text: str) -> Optional[str]:
    """
    Detect the primary language of the query text.
    Returns ISO 639-1 code ('pt', 'es', 'ja', 'zh', 'ko', 'en') or None.
    """
    import unicodedata
    if not text:
        return None

    # Check for East Asian scripts
    cjk = 0
    for ch in text:
        name = unicodedata.name(ch, "")
        if "CJK" in name or "HIRAGANA" in name or "KATAKANA" in name:
            cjk += 1
    if cjk > 0:
        has_hiragana = any("HIRAGANA" in unicodedata.name(c, "") or "KATAKANA" in unicodedata.name(c, "") for c in text)
        return "ja" if has_hiragana else "zh"
    if any("\uAC00" <= ch <= "\uD7A3" or "\u1100" <= ch <= "\u11FF" for ch in text):
        return "ko"

    # Portuguese and Spanish stop words / indicators
    lower = text.lower()
    pt_indicators = [
        " de ", " da ", " do ", " para ", " como ", " em ", " que ", " os ", " as ",
        " um ", " uma ", " não ", " com ", " cortes", " podcast", " curiosidades",
        " finanças", " mistério", " terror", " memes"
    ]
    es_indicators = [" de ", " la ", " el ", " en ", " y ", " que ", " los ", " las ", " un ", " una ", " por ", " para "]

    pt_matches = sum(1 for ind in pt_indicators if ind in f" {lower} ")
    es_matches = sum(1 for ind in es_indicators if ind in f" {lower} ")

    # Accented characters common in Portuguese / Spanish
    pt_chars = sum(1 for ch in lower if ch in "ãõçáéíóúâêô")
    es_chars = sum(1 for ch in lower if ch in "ñ¿¡áéíóú")

    if pt_matches > 0 or pt_chars > 0:
        return "pt"
    if es_matches > 0 or es_chars > 0:
        return "es"

    # Default to None so YouTube API does not artificially restrict Latin/global searches
    return None


def _get_recent_date(days: int = 5) -> str:
    """Return ISO date string for N days ago."""
    dt = datetime.utcnow() - timedelta(days=max(days, 1))
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_duration(duration_str: str) -> Optional[int]:
    """Parse ISO 8601 duration (PT1H2M3S) to seconds."""
    import re
    if not duration_str:
        return None
    match = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration_str)
    if not match:
        return None
    h, m, s = match.groups()
    return int(h or 0) * 3600 + int(m or 0) * 60 + int(s or 0)


def _parse_date(date_str: str) -> Optional[datetime]:
    """Parse YouTube date string to datetime."""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        return None
