# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""REST /api/settings — user settings CRUD + credential testing + OAuth callbacks."""
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import Optional
from sqlalchemy import select

from backend.database import AsyncSessionLocal
from backend.models.user_settings import UserSettings
from backend.core.crypto import encrypt
from backend.core.http_utils import get_user_agent
from backend.config import settings as app_settings

logger = logging.getLogger(__name__)
router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class SettingsResponse(BaseModel):
    # AI provider preference (BYOK)
    ai_provider: str = "openai"
    ai_model: Optional[str] = None
    ai_base_url: Optional[str] = None  # OpenAI-compatible provider only; not a secret
    ai_api_key_set: bool = False  # masked — never returns the actual key

    # Service API keys (BYOK) — booleans only, never the plaintext key
    youtube_api_key_set: bool = False
    pexels_api_key_set: bool = False
    pixabay_api_key_set: bool = False
    groq_api_key_set: bool = False
    google_tts_api_key_set: bool = False
    elevenlabs_api_key_set: bool = False
    youtube_cookies_set: bool = False
    youtube_cookies_set_at: Optional[datetime] = None

    # OAuth / Social status
    douyin_cookie_set: bool = False
    tiktok_cookie_set: bool = False
    youtube_channel_title: Optional[str] = None
    youtube_connected: bool = False
    youtube_client_id_set: bool = False
    tiktok_upload_connected: bool = False
    tiktok_client_key_set: bool = False
    instagram_connected: bool = False
    instagram_user_id: Optional[str] = None
    instagram_account_name: Optional[str] = None
    instagram_client_id_set: bool = False
    instagram_access_token_set: bool = False

    # Preferences
    preferred_voice_id: str = "21m00Tcm4TlvDq8ikWAM"
    tts_provider: str = "edge_tts"
    preferred_tts_voice: Optional[str] = None
    stt_provider: str = "groq"
    whisper_quality: str = "balanced"
    caption_style: str = "viral"
    caption_enabled: bool = True
    music_enabled: bool = True
    music_genre: str = "lofi"
    music_volume_db: float = -14.0
    upload_to_youtube: bool = True
    upload_to_tiktok: bool = False
    upload_to_instagram: bool = False
    tiktok_default_privacy: str = "PUBLIC_TO_EVERYONE"

    class Config:
        from_attributes = True


class SettingsUpdate(BaseModel):
    # AI provider preference (BYOK)
    ai_provider: Optional[str] = None
    ai_model: Optional[str] = None
    ai_base_url: Optional[str] = None  # empty string clears
    ai_api_key: Optional[str] = None  # plaintext on input — encrypted before storage

    # Service API keys (BYOK) — plaintext on input, encrypted before storage.
    # Send empty string to clear a stored key.
    youtube_api_key: Optional[str] = None
    pexels_api_key: Optional[str] = None
    pixabay_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    google_tts_api_keys: Optional[str] = None  # single key or comma-separated pool
    elevenlabs_api_keys: Optional[str] = None  # single key or comma-separated pool
    youtube_cookies: Optional[str] = None      # Netscape cookies.txt content (empty string to clear)

    # Social BYOK OAuth Credentials & Tokens
    youtube_client_id: Optional[str] = None
    youtube_client_secret: Optional[str] = None
    tiktok_client_key: Optional[str] = None
    tiktok_client_secret: Optional[str] = None
    tiktok_cookie: Optional[str] = None
    instagram_client_id: Optional[str] = None
    instagram_client_secret: Optional[str] = None
    instagram_access_token: Optional[str] = None
    instagram_user_id: Optional[str] = None

    # Preferences
    preferred_voice_id: Optional[str] = None
    tts_provider: Optional[str] = None
    preferred_tts_voice: Optional[str] = None
    stt_provider: Optional[str] = None
    whisper_quality: Optional[str] = None
    caption_style: Optional[str] = None
    caption_enabled: Optional[bool] = None
    music_enabled: Optional[bool] = None
    music_genre: Optional[str] = None
    music_volume_db: Optional[float] = None
    upload_to_youtube: Optional[bool] = None
    upload_to_tiktok: Optional[bool] = None
    upload_to_instagram: Optional[bool] = None
    tiktok_default_privacy: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/settings", response_model=SettingsResponse)
async def get_settings():
    """Return user settings with secrets masked."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == "local")
        )
        s = result.scalar_one_or_none()

    # Determine effective provider and key status
    effective_provider = (s.ai_provider if s else None) or "openai"
    effective_model = s.ai_model if s else None
    effective_base_url = s.ai_base_url if s else None
    ai_key_set = bool(s.ai_api_key_encrypted) if s else False

    # Fall back to .env if DB has no explicit key or server URL
    if not ai_key_set and not (effective_provider == "openai_compatible" and effective_base_url):
        if app_settings.CUSTOM_AI_BASE_URL:
            effective_provider = "openai_compatible"
            effective_model = effective_model or app_settings.CUSTOM_AI_MODEL
            effective_base_url = app_settings.CUSTOM_AI_BASE_URL
            ai_key_set = bool(app_settings.CUSTOM_AI_API_KEY)
        elif app_settings.ANTHROPIC_API_KEY:
            effective_provider = "anthropic"
            ai_key_set = True
        elif app_settings.OPENROUTER_API_KEY:
            effective_provider = "openrouter"
            ai_key_set = True
        elif app_settings.OPENAI_API_KEY:
            effective_provider = "openai"
            ai_key_set = True

    youtube_set = bool(s.youtube_api_key_encrypted) if s else False
    if not youtube_set and app_settings.YOUTUBE_API_KEY:
        youtube_set = True

    # Pexels — DB-stored key takes precedence, then .env fallback
    pexels_set = bool(s and s.pexels_api_key_encrypted) or bool(app_settings.PEXELS_API_KEY)
    # Pixabay — DB-stored key takes precedence, then .env fallback
    pixabay_set = bool(s and s.pixabay_api_key_encrypted) or bool(app_settings.PIXABAY_API_KEY)
    # Groq Whisper STT — DB-stored key takes precedence, then .env fallback
    groq_set = bool(s and s.groq_api_key_encrypted) or bool(app_settings.GROQ_API_KEY)
    # Google Cloud TTS — DB-stored key(s) take precedence, then .env fallback
    google_tts_set = bool(s and s.google_tts_api_keys_encrypted) or bool(
        app_settings.GOOGLE_TTS_API_KEY or app_settings.GOOGLE_TTS_API_KEYS
    )
    # ElevenLabs — DB-stored key(s) take precedence, then .env fallback
    elevenlabs_set = bool(s and s.elevenlabs_api_keys_encrypted) or bool(
        app_settings.ELEVENLABS_API_KEY or app_settings.ELEVENLABS_API_KEYS
    )
    # YouTube Anti-bot Cookies — DB-stored take precedence, then .env / file fallback
    youtube_cookies_set = bool(s and s.youtube_cookies_encrypted) or bool(
        app_settings.YOUTUBE_COOKIES or app_settings.YOUTUBE_COOKIE_PATH
    ) or (app_settings.STORAGE_ROOT / "yt_cookies.txt").exists()

    # YouTube OAuth status
    youtube_client_id_set = bool(s and s.youtube_client_id_encrypted) or bool(app_settings.YOUTUBE_CLIENT_ID)
    youtube_connected = bool(s and s.youtube_credentials_json_encrypted)

    # TikTok OAuth & Cookies
    tiktok_client_key_set = bool(s and s.tiktok_client_key_encrypted) or bool(app_settings.TIKTOK_CLIENT_KEY)
    tiktok_upload_connected = bool(s and s.tiktok_upload_token_encrypted)
    tiktok_cookie_set = bool(s and s.tiktok_cookie_encrypted)

    # Instagram Reels
    instagram_client_id_set = bool(s and s.instagram_client_id_encrypted) or bool(
        app_settings.INSTAGRAM_CLIENT_ID or app_settings.FACEBOOK_APP_ID
    )
    instagram_access_token_set = bool(s and s.instagram_access_token_encrypted) or bool(app_settings.INSTAGRAM_ACCESS_TOKEN)
    instagram_connected = bool(s and (s.instagram_access_token_encrypted or s.instagram_user_id))
    instagram_user_id = s.instagram_user_id if s else None
    instagram_account_name = s.instagram_account_name if s else None
    upload_to_instagram = bool(s.upload_to_instagram) if (s and s.upload_to_instagram is not None) else False

    if not s:
        return SettingsResponse(
            ai_provider=effective_provider,
            ai_model=effective_model,
            ai_base_url=effective_base_url,
            ai_api_key_set=ai_key_set,
            youtube_api_key_set=youtube_set,
            pexels_api_key_set=pexels_set,
            pixabay_api_key_set=pixabay_set,
            groq_api_key_set=groq_set,
            google_tts_api_key_set=google_tts_set,
            elevenlabs_api_key_set=elevenlabs_set,
            youtube_cookies_set=youtube_cookies_set,
            youtube_client_id_set=youtube_client_id_set,
            youtube_connected=youtube_connected,
            tiktok_client_key_set=tiktok_client_key_set,
            tiktok_upload_connected=tiktok_upload_connected,
            tiktok_cookie_set=tiktok_cookie_set,
            instagram_client_id_set=instagram_client_id_set,
            instagram_access_token_set=instagram_access_token_set,
            instagram_connected=instagram_connected,
            upload_to_instagram=upload_to_instagram,
            stt_provider="groq" if groq_set else "local",
            whisper_quality="balanced",
        )

    return SettingsResponse(
        ai_provider=effective_provider,
        ai_model=effective_model,
        ai_base_url=effective_base_url,
        ai_api_key_set=ai_key_set,
        youtube_api_key_set=youtube_set,
        pexels_api_key_set=pexels_set,
        pixabay_api_key_set=pixabay_set,
        groq_api_key_set=groq_set,
        google_tts_api_key_set=google_tts_set,
        elevenlabs_api_key_set=elevenlabs_set,
        youtube_cookies_set=youtube_cookies_set,
        youtube_cookies_set_at=s.youtube_cookies_set_at if s else None,
        douyin_cookie_set=bool(s.douyin_cookie_encrypted),
        tiktok_cookie_set=tiktok_cookie_set,
        youtube_channel_title=s.youtube_channel_title,
        youtube_connected=youtube_connected,
        youtube_client_id_set=youtube_client_id_set,
        tiktok_upload_connected=tiktok_upload_connected,
        tiktok_client_key_set=tiktok_client_key_set,
        instagram_connected=instagram_connected,
        instagram_user_id=instagram_user_id,
        instagram_account_name=instagram_account_name,
        instagram_client_id_set=instagram_client_id_set,
        instagram_access_token_set=instagram_access_token_set,
        preferred_voice_id=s.preferred_voice_id or "21m00Tcm4TlvDq8ikWAM",
        tts_provider=s.tts_provider or "edge_tts",
        preferred_tts_voice=s.preferred_tts_voice,
        stt_provider=s.stt_provider if (s and s.stt_provider) else ("groq" if groq_set else "local"),
        whisper_quality=s.whisper_quality or "balanced",
        caption_style=s.caption_style or "viral",
        caption_enabled=s.caption_enabled if s.caption_enabled is not None else True,
        music_enabled=s.music_enabled if s.music_enabled is not None else True,
        music_genre=s.music_genre or "lofi",
        music_volume_db=s.music_volume_db if s.music_volume_db is not None else -14.0,
        upload_to_youtube=s.upload_to_youtube if s.upload_to_youtube is not None else True,
        upload_to_tiktok=s.upload_to_tiktok or False,
        upload_to_instagram=upload_to_instagram,
        tiktok_default_privacy=s.tiktok_default_privacy or "PUBLIC_TO_EVERYONE",
    )


@router.post("/settings", response_model=SettingsResponse)
async def update_settings(update: SettingsUpdate):
    """Update user settings. Keys are encrypted before saving."""
    if update.caption_style is not None:
        from backend.services.caption_service import style_id_known, unknown_style_message
        if not await style_id_known(update.caption_style):
            raise HTTPException(status_code=400, detail=unknown_style_message(update.caption_style))
    from backend.core.ai_provider import AIProvider, normalize_base_url

    # Validate before touching the DB so a bad value saves nothing.
    if update.ai_provider is not None:
        try:
            AIProvider(update.ai_provider)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown AI provider: {update.ai_provider}")
    base_url = None
    if update.ai_base_url is not None:
        try:
            base_url = normalize_base_url(update.ai_base_url)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(UserSettings).where(UserSettings.user_id == "local")
        )
        s = result.scalar_one_or_none()
        if not s:
            s = UserSettings(user_id="local")
            db.add(s)

        # AI provider preference (BYOK)
        if update.ai_provider is not None:
            s.ai_provider = update.ai_provider
        if update.ai_model is not None:
            s.ai_model = update.ai_model or None
        if update.ai_base_url is not None:
            s.ai_base_url = base_url or None
        if update.ai_api_key is not None:
            # Empty string clears the stored key; otherwise encrypt + store
            s.ai_api_key_encrypted = encrypt(update.ai_api_key) if update.ai_api_key else None

        # Service API keys (BYOK) — empty string clears, populated value encrypts
        if update.youtube_api_key is not None:
            s.youtube_api_key_encrypted = encrypt(update.youtube_api_key) if update.youtube_api_key else None
        if update.pexels_api_key is not None:
            s.pexels_api_key_encrypted = encrypt(update.pexels_api_key) if update.pexels_api_key else None
        if update.pixabay_api_key is not None:
            s.pixabay_api_key_encrypted = encrypt(update.pixabay_api_key) if update.pixabay_api_key else None
        if update.groq_api_key is not None:
            s.groq_api_key_encrypted = encrypt(update.groq_api_key) if update.groq_api_key else None
        if update.google_tts_api_keys is not None:
            clean_g = ",".join([k.strip() for k in update.google_tts_api_keys.replace("\n", ",").split(",") if k.strip()]) if update.google_tts_api_keys else ""
            s.google_tts_api_keys_encrypted = encrypt(clean_g) if clean_g else None
            try:
                from backend.services.google_tts_service import reconfigure_key_pool
                keys_list = clean_g.split(",") if clean_g else []
                if keys_list:
                    reconfigure_key_pool(keys_list)
            except Exception as e:
                logger.warning("Could not reconfigure Google TTS key pool at runtime: %s", e)
        if update.elevenlabs_api_keys is not None:
            clean_e = ",".join([k.strip() for k in update.elevenlabs_api_keys.replace("\n", ",").split(",") if k.strip()]) if update.elevenlabs_api_keys else ""
            s.elevenlabs_api_keys_encrypted = encrypt(clean_e) if clean_e else None
            try:
                from backend.services.elevenlabs_service import reconfigure_key_pool
                keys_list = clean_e.split(",") if clean_e else []
                if keys_list:
                    reconfigure_key_pool(keys_list)
            except Exception as e:
                logger.warning("Could not reconfigure ElevenLabs key pool at runtime: %s", e)
        if update.youtube_cookies is not None:
            clean_ck = update.youtube_cookies.strip()
            if clean_ck:
                s.youtube_cookies_encrypted = encrypt(clean_ck)
                s.youtube_cookies_set_at = datetime.utcnow()
                try:
                    from backend.services.ytdlp_service import sync_youtube_cookies_to_disk
                    sync_youtube_cookies_to_disk(clean_ck)
                except Exception as e:
                    logger.warning("Could not sync YouTube cookies to disk: %s", e)
            else:
                s.youtube_cookies_encrypted = None
                s.youtube_cookies_set_at = None
                try:
                    from backend.services.ytdlp_service import clear_youtube_cookies
                    clear_youtube_cookies()
                except Exception as e:
                    logger.warning("Could not clear YouTube cookies from disk: %s", e)

        # Preference fields
        if update.preferred_voice_id is not None:
            s.preferred_voice_id = update.preferred_voice_id
        if update.tts_provider is not None:
            s.tts_provider = update.tts_provider
        if update.preferred_tts_voice is not None:
            s.preferred_tts_voice = update.preferred_tts_voice
        if update.stt_provider is not None:
            s.stt_provider = update.stt_provider
        if update.whisper_quality is not None:
            s.whisper_quality = update.whisper_quality
        if update.caption_style is not None:
            s.caption_style = update.caption_style
        if update.caption_enabled is not None:
            s.caption_enabled = update.caption_enabled
        if update.music_enabled is not None:
            s.music_enabled = update.music_enabled
        if update.music_genre is not None:
            s.music_genre = update.music_genre
        if update.music_volume_db is not None:
            s.music_volume_db = update.music_volume_db
        # Social BYOK Keys & Tokens
        if update.youtube_client_id is not None:
            s.youtube_client_id_encrypted = encrypt(update.youtube_client_id.strip()) if update.youtube_client_id.strip() else None
        if update.youtube_client_secret is not None:
            s.youtube_client_secret_encrypted = encrypt(update.youtube_client_secret.strip()) if update.youtube_client_secret.strip() else None

        if update.tiktok_client_key is not None:
            s.tiktok_client_key_encrypted = encrypt(update.tiktok_client_key.strip()) if update.tiktok_client_key.strip() else None
        if update.tiktok_client_secret is not None:
            s.tiktok_client_secret_encrypted = encrypt(update.tiktok_client_secret.strip()) if update.tiktok_client_secret.strip() else None
        if update.tiktok_cookie is not None:
            clean_tc = update.tiktok_cookie.strip()
            s.tiktok_cookie_encrypted = encrypt(clean_tc) if clean_tc else None
            s.tiktok_cookie_set_at = datetime.utcnow() if clean_tc else None

        if update.instagram_client_id is not None:
            s.instagram_client_id_encrypted = encrypt(update.instagram_client_id.strip()) if update.instagram_client_id.strip() else None
        if update.instagram_client_secret is not None:
            s.instagram_client_secret_encrypted = encrypt(update.instagram_client_secret.strip()) if update.instagram_client_secret.strip() else None
        if update.instagram_access_token is not None:
            s.instagram_access_token_encrypted = encrypt(update.instagram_access_token.strip()) if update.instagram_access_token.strip() else None
        if update.instagram_user_id is not None:
            s.instagram_user_id = update.instagram_user_id.strip() if update.instagram_user_id.strip() else None

        if update.upload_to_youtube is not None:
            s.upload_to_youtube = update.upload_to_youtube
        if update.upload_to_tiktok is not None:
            s.upload_to_tiktok = update.upload_to_tiktok
        if update.upload_to_instagram is not None:
            s.upload_to_instagram = update.upload_to_instagram
        if update.tiktok_default_privacy is not None:
            s.tiktok_default_privacy = update.tiktok_default_privacy

        await db.commit()

    return await get_settings()


def _resolve_redirect_uri(request: Request, endpoint_path: str, fallback_config_uri: str = "") -> str:
    """Compute effective public redirect URI respecting reverse-proxy headers and origins."""
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if host:
        return f"{proto}://{host}{endpoint_path}"
    if fallback_config_uri:
        return fallback_config_uri
    return str(request.url_for(endpoint_path.lstrip("/")))


# ── YouTube OAuth & Disconnect ────────────────────────────────────────────────

@router.get("/settings/youtube-auth")
async def youtube_auth(request: Request, redirect_uri: Optional[str] = Query(None), json_mode: bool = Query(False, alias="json")):
    """Initiate Google OAuth flow for YouTube."""
    from backend.services.youtube_uploader import build_youtube_auth_url
    effective_redirect = redirect_uri or _resolve_redirect_uri(request, "/api/settings/youtube-callback", app_settings.YOUTUBE_REDIRECT_URI)
    try:
        url = await build_youtube_auth_url(redirect_uri=effective_redirect)
        if json_mode or request.headers.get("accept", "").startswith("application/json"):
            return {"ok": True, "auth_url": url}
        return RedirectResponse(url)
    except Exception as e:
        logger.warning(f"Failed to generate YouTube auth URL: {e}")
        if json_mode or request.headers.get("accept", "").startswith("application/json"):
            return {"ok": False, "error": str(e)}
        return RedirectResponse(f"/settings?youtube_error={str(e)[:200]}")


@router.get("/settings/youtube-callback")
async def youtube_callback(request: Request, code: str = Query(...), state: Optional[str] = Query(None)):
    """Handle YouTube OAuth callback — exchange code for credentials."""
    from backend.services.youtube_uploader import exchange_youtube_code
    effective_redirect = _resolve_redirect_uri(request, "/api/settings/youtube-callback", app_settings.YOUTUBE_REDIRECT_URI)
    try:
        result = await exchange_youtube_code(code, redirect_uri=effective_redirect)
        creds_json = result["credentials"]
        channel_title = result.get("channel_title", "")

        async with AsyncSessionLocal() as db:
            res = await db.execute(
                select(UserSettings).where(UserSettings.user_id == "local")
            )
            s = res.scalar_one_or_none()
            if not s:
                s = UserSettings(user_id="local")
                db.add(s)
            import json
            enc_creds = encrypt(json.dumps(creds_json))
            s.youtube_credentials_json_encrypted = enc_creds
            s.youtube_channel_title = channel_title

            from backend.models.social_account import SocialAccount
            sa_res = await db.execute(
                select(SocialAccount).where(SocialAccount.user_id == "local", SocialAccount.platform == "youtube")
            )
            sa = sa_res.scalar_one_or_none()
            if not sa:
                sa = SocialAccount(
                    user_id="local",
                    platform="youtube",
                    account_name=channel_title or "Canal YouTube Conectado",
                    credentials_encrypted=enc_creds,
                    metadata_json={"source": "oauth_callback"},
                )
                db.add(sa)
            else:
                sa.account_name = channel_title or sa.account_name
                sa.credentials_encrypted = enc_creds

            await db.commit()

        import urllib.parse
        return RedirectResponse(f"/settings?youtube_connected=true&channel={urllib.parse.quote(channel_title)}")
    except Exception as e:
        logger.error(f"YouTube OAuth callback failed: {e}")
        import urllib.parse
        return RedirectResponse(f"/settings?youtube_error={urllib.parse.quote(str(e)[:200])}")


@router.post("/settings/youtube-disconnect")
async def youtube_disconnect():
    """Disconnect YouTube account."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(UserSettings).where(UserSettings.user_id == "local")
        )
        s = res.scalar_one_or_none()
        if s:
            s.youtube_credentials_json_encrypted = None
            s.youtube_channel_title = None

        from backend.models.social_account import SocialAccount
        sa_res = await db.execute(
            select(SocialAccount).where(SocialAccount.user_id == "local", SocialAccount.platform == "youtube")
        )
        sa = sa_res.scalar_one_or_none()
        if sa:
            await db.delete(sa)

        await db.commit()
    return {"ok": True, "message": "Conta do YouTube desconectada com sucesso"}


# ── TikTok OAuth, Cookie & Disconnect ─────────────────────────────────────────

@router.get("/settings/tiktok-upload-auth")
async def tiktok_upload_auth(request: Request, redirect_uri: Optional[str] = Query(None), json_mode: bool = Query(False, alias="json")):
    """Initiate TikTok OAuth flow for video upload."""
    from backend.services.tiktok_uploader import build_tiktok_auth_url
    effective_redirect = redirect_uri or _resolve_redirect_uri(request, "/api/settings/tiktok-upload-callback", app_settings.TIKTOK_REDIRECT_URI)
    try:
        url = await build_tiktok_auth_url(redirect_uri=effective_redirect)
        if json_mode or request.headers.get("accept", "").startswith("application/json"):
            return {"ok": True, "auth_url": url}
        return RedirectResponse(url)
    except Exception as e:
        logger.warning(f"Failed to generate TikTok auth URL: {e}")
        if json_mode or request.headers.get("accept", "").startswith("application/json"):
            return {"ok": False, "error": str(e)}
        return RedirectResponse(f"/settings?tiktok_error={str(e)[:200]}")


@router.get("/settings/tiktok-upload-callback")
async def tiktok_upload_callback(request: Request, code: str = Query(...), state: Optional[str] = Query(None)):
    """Handle TikTok OAuth callback — exchange code for tokens."""
    from backend.services.tiktok_uploader import exchange_tiktok_code
    effective_redirect = _resolve_redirect_uri(request, "/api/settings/tiktok-upload-callback", app_settings.TIKTOK_REDIRECT_URI)
    try:
        result = await exchange_tiktok_code(code, redirect_uri=effective_redirect)

        async with AsyncSessionLocal() as db:
            res = await db.execute(
                select(UserSettings).where(UserSettings.user_id == "local")
            )
            s = res.scalar_one_or_none()
            if not s:
                s = UserSettings(user_id="local")
                db.add(s)
            s.tiktok_upload_token_encrypted = encrypt(result["access_token"])
            if result.get("refresh_token"):
                s.tiktok_upload_refresh_token_encrypted = encrypt(result["refresh_token"])
            if result.get("expires_in"):
                from datetime import timedelta
                s.tiktok_upload_token_expiry = datetime.utcnow() + timedelta(seconds=result["expires_in"])

            from backend.models.social_account import SocialAccount
            sa_res = await db.execute(
                select(SocialAccount).where(SocialAccount.user_id == "local", SocialAccount.platform == "tiktok")
            )
            sa = sa_res.scalar_one_or_none()
            if not sa:
                sa = SocialAccount(
                    user_id="local",
                    platform="tiktok",
                    account_name="Conta TikTok Conectada",
                    credentials_encrypted=s.tiktok_upload_token_encrypted,
                    metadata_json={"source": "oauth_callback"},
                )
                db.add(sa)
            else:
                sa.credentials_encrypted = s.tiktok_upload_token_encrypted

            await db.commit()

        return RedirectResponse("/settings?tiktok_connected=true")
    except Exception as e:
        logger.error(f"TikTok OAuth callback failed: {e}")
        import urllib.parse
        return RedirectResponse(f"/settings?tiktok_error={urllib.parse.quote(str(e)[:200])}")


@router.post("/settings/tiktok-disconnect")
async def tiktok_disconnect():
    """Disconnect TikTok OAuth account and clear cookie."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(UserSettings).where(UserSettings.user_id == "local")
        )
        s = res.scalar_one_or_none()
        if s:
            s.tiktok_upload_token_encrypted = None
            s.tiktok_upload_refresh_token_encrypted = None
            s.tiktok_upload_token_expiry = None
            s.tiktok_cookie_encrypted = None
            s.tiktok_cookie_set_at = None
            await db.commit()
    return {"ok": True, "message": "Conta do TikTok desconectada com sucesso"}


# ── Instagram Reels OAuth, Direct Token & Disconnect ─────────────────────────

@router.get("/settings/instagram-auth")
async def instagram_auth(request: Request, redirect_uri: Optional[str] = Query(None), json_mode: bool = Query(False, alias="json")):
    """Initiate Meta / Instagram Graph API OAuth flow."""
    from backend.services.instagram_uploader import build_instagram_auth_url
    effective_redirect = redirect_uri or _resolve_redirect_uri(request, "/api/settings/instagram-callback", app_settings.INSTAGRAM_REDIRECT_URI)
    try:
        url = await build_instagram_auth_url(redirect_uri=effective_redirect)
        if json_mode or request.headers.get("accept", "").startswith("application/json"):
            return {"ok": True, "auth_url": url}
        return RedirectResponse(url)
    except Exception as e:
        logger.warning(f"Failed to generate Instagram auth URL: {e}")
        if json_mode or request.headers.get("accept", "").startswith("application/json"):
            return {"ok": False, "error": str(e)}
        return RedirectResponse(f"/settings?instagram_error={str(e)[:200]}")


@router.get("/settings/instagram-callback")
async def instagram_callback(request: Request, code: str = Query(...), state: Optional[str] = Query(None)):
    """Handle Meta / Instagram OAuth callback — exchange code for long-lived token."""
    from backend.services.instagram_uploader import exchange_instagram_code
    effective_redirect = _resolve_redirect_uri(request, "/api/settings/instagram-callback", app_settings.INSTAGRAM_REDIRECT_URI)
    try:
        result = await exchange_instagram_code(code, redirect_uri=effective_redirect)
        access_token = result["access_token"]
        ig_user_id = result.get("ig_user_id", "")
        account_name = result.get("account_name", "")

        async with AsyncSessionLocal() as db:
            res = await db.execute(
                select(UserSettings).where(UserSettings.user_id == "local")
            )
            s = res.scalar_one_or_none()
            if not s:
                s = UserSettings(user_id="local")
                db.add(s)
            s.instagram_access_token_encrypted = encrypt(access_token)
            s.instagram_user_id = ig_user_id or None
            s.instagram_account_name = account_name or None

            from backend.models.social_account import SocialAccount
            sa_res = await db.execute(
                select(SocialAccount).where(SocialAccount.user_id == "local", SocialAccount.platform == "instagram")
            )
            sa = sa_res.scalar_one_or_none()
            if not sa:
                sa = SocialAccount(
                    user_id="local",
                    platform="instagram",
                    account_id=ig_user_id or None,
                    account_name=account_name or "Conta Instagram Reels",
                    credentials_encrypted=s.instagram_access_token_encrypted,
                    metadata_json={"source": "oauth_callback"},
                )
                db.add(sa)
            else:
                sa.account_name = account_name or sa.account_name
                sa.credentials_encrypted = s.instagram_access_token_encrypted
                if ig_user_id:
                    sa.account_id = ig_user_id

            await db.commit()

        import urllib.parse
        return RedirectResponse(f"/settings?instagram_connected=true&account={urllib.parse.quote(account_name)}")
    except Exception as e:
        logger.error(f"Instagram OAuth callback failed: {e}")
        import urllib.parse
        return RedirectResponse(f"/settings?instagram_error={urllib.parse.quote(str(e)[:200])}")


@router.post("/settings/instagram-direct-connect")
async def instagram_direct_connect(body: dict):
    """Directly connect Instagram using a long-lived Access Token (BYOK Express)."""
    access_token = (body.get("access_token") or "").strip()
    ig_user_id = (body.get("ig_user_id") or "").strip()
    if not access_token:
        return {"ok": False, "error": "Token de acesso não fornecido"}

    from backend.services.instagram_uploader import verify_instagram_token
    verify = await verify_instagram_token(access_token, ig_user_id=ig_user_id or None)
    if not verify.get("ok"):
        return {"ok": False, "error": verify.get("error", "Token do Instagram inválido ou sem permissão de publicação")}

    account_name = verify.get("account_name", "")
    resolved_id = verify.get("ig_user_id") or ig_user_id

    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(UserSettings).where(UserSettings.user_id == "local")
        )
        s = res.scalar_one_or_none()
        if not s:
            s = UserSettings(user_id="local")
            db.add(s)
        s.instagram_access_token_encrypted = encrypt(access_token)
        s.instagram_user_id = resolved_id or None
        s.instagram_account_name = account_name or None
        await db.commit()

    return {"ok": True, "account_name": account_name, "ig_user_id": resolved_id}


@router.post("/settings/instagram-disconnect")
async def instagram_disconnect():
    """Disconnect Instagram account."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(UserSettings).where(UserSettings.user_id == "local")
        )
        s = res.scalar_one_or_none()
        if s:
            s.instagram_access_token_encrypted = None
            s.instagram_user_id = None
            s.instagram_account_name = None
            await db.commit()
    return {"ok": True, "message": "Conta do Instagram desconectada com sucesso"}


@router.post("/settings/test-cookie")
async def test_cookie(body: dict):
    """Test a platform session cookie."""
    platform = body.get("platform", "")
    cookie = body.get("cookie", "")
    if not cookie:
        return {"ok": False, "error": "No cookie provided"}

    if platform == "tiktok":
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://www.tiktok.com/api/user/detail/",
                    cookies={"sessionid": cookie},
                    headers={"User-Agent": get_user_agent()},
                )
                if resp.status_code == 200 and resp.json().get("userInfo"):
                    return {"ok": True}
                return {"ok": False, "error": "Cookie appears invalid"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    elif platform == "douyin":
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    "https://www.douyin.com/aweme/v1/web/user/profile/self/",
                    cookies={"sessionid": cookie},
                    headers={"User-Agent": get_user_agent()},
                )
                if resp.status_code == 200:
                    return {"ok": True}
                return {"ok": False, "error": "Cookie appears invalid"}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    elif platform == "youtube":
        cookie_text = cookie.strip()
        if not cookie_text or cookie_text == "__check_saved__":
            cookie_text = None
        from backend.services.ytdlp_service import check_youtube_cookies_validity
        import asyncio
        return await asyncio.to_thread(check_youtube_cookies_validity, cookie_text)

    return {"ok": False, "error": f"Unknown platform: {platform}"}


@router.get("/settings/health")
async def get_health():
    """Return system health status."""
    import shutil
    import subprocess

    health = {}

    # Cookie health
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(UserSettings).where(UserSettings.user_id == "local")
        )
        s = res.scalar_one_or_none()

    if s:
        for platform, cookie_field, set_at_field in [
            ("douyin_cookie", "douyin_cookie_encrypted", "douyin_cookie_set_at"),
            ("tiktok_cookie", "tiktok_cookie_encrypted", "tiktok_cookie_set_at"),
            ("youtube_cookies", "youtube_cookies_encrypted", "youtube_cookies_set_at"),
        ]:
            cookie = getattr(s, cookie_field, None) if s else None
            set_at = getattr(s, set_at_field, None) if s else None
            if cookie and set_at:
                age = (datetime.utcnow() - set_at).days
                status = "valid" if age < 25 else ("expiring_soon" if age < 30 else "expired")
                health[platform] = {"status": status, "age_days": age}
            elif cookie:
                health[platform] = {"status": "unknown_age"}
            else:
                health[platform] = {"status": "not_configured"}
    else:
        health["douyin_cookie"] = {"status": "not_configured"}
        health["tiktok_cookie"] = {"status": "not_configured"}

    # ImageMagick
    if shutil.which("magick") or shutil.which("convert"):
        health["imagemagick"] = {"status": "ok"}
    else:
        health["imagemagick"] = {"status": "not_found"}

    # yt-dlp
    try:
        r = subprocess.run(["yt-dlp", "--version"], capture_output=True, text=True, timeout=5)
        health["ytdlp"] = {"status": "ok", "version": r.stdout.strip()}
    except Exception:
        health["ytdlp"] = {"status": "not_found"}

    # AI provider configured (BYOK)
    has_ai_key = bool(
        app_settings.ANTHROPIC_API_KEY
        or app_settings.OPENAI_API_KEY
        or app_settings.OPENROUTER_API_KEY
        or app_settings.CUSTOM_AI_BASE_URL
        or (s and s.ai_api_key_encrypted)
        or (s and s.ai_provider == "openai_compatible" and s.ai_base_url)
    )
    health["ai_provider"] = {"status": "configured" if has_ai_key else "not_configured"}

    # YouTube API key (BYOK — per-user encrypted or .env fallback)
    has_youtube_key = bool(
        app_settings.YOUTUBE_API_KEY
        or (s and s.youtube_api_key_encrypted)
    )
    health["youtube_api_key"] = {"status": "configured" if has_youtube_key else "not_configured"}

    # YouTube quota
    from backend.services.youtube_quota import _usage_today, DAILY_LIMIT
    health["youtube_quota"] = {"used": _usage_today.get("count", 0), "limit": DAILY_LIMIT}

    # Occupancy of the download / transcription thread pools. A non-zero
    # `abandoned` is the one clear "this process wants a restart" signal: a
    # stalled download or Whisper call that was given up on is still holding
    # its worker thread (Python cannot kill a thread).
    from backend.core.executors import all_pool_stats
    health["thread_pools"] = all_pool_stats()

    # Google TTS key pool status (how many keys are healthy vs exhausted)
    try:
        from backend.services.google_tts_service import get_key_pool_status
        pool = get_key_pool_status()
        if pool["total_keys"] > 0:
            health["google_tts_pool"] = pool
    except Exception:
        pass

    # ElevenLabs key pool status
    try:
        from backend.services.elevenlabs_service import get_key_pool_status
        pool = get_key_pool_status()
        if pool["total_keys"] > 0:
            health["elevenlabs_pool"] = pool
    except Exception:
        pass

    return health


@router.post("/settings/open-folder")
async def open_folder(body: dict):
    """Open a storage folder in the OS file manager."""
    import platform, subprocess
    from pathlib import Path

    folder_map = {
        "videos": app_settings.VIDEOS_DIR,
        "audio": app_settings.AUDIO_DIR,
        "generated": app_settings.GENERATED_DIR,
        "thumbnails": app_settings.THUMBNAILS_DIR,
        "storage": app_settings.STORAGE_ROOT,
    }

    folder_key = body.get("folder", "storage")
    target = folder_map.get(folder_key, app_settings.STORAGE_ROOT)
    target = Path(target).resolve()
    target.mkdir(parents=True, exist_ok=True)

    system = platform.system()
    try:
        if system == "Darwin":
            subprocess.Popen(["open", str(target)])
        elif system == "Windows":
            subprocess.Popen(["explorer", str(target)])
        else:
            subprocess.Popen(["xdg-open", str(target)])
        return {"ok": True, "path": str(target)}
    except Exception as e:
        return {"ok": False, "error": str(e), "path": str(target)}


# ── Motion Graphics (HyperFrames) — on-demand Node plugin ─────────────────────
# Nothing motion-related ships in the base install. The portable Node runtime
# and the HyperFrames npm package are downloaded on opt-in and live entirely in
# the user's data dir, so the feature can be added and removed without touching
# the app. Rendering is local (headless Chrome + FFmpeg) and costs nothing.

@router.get("/settings/motion-graphics/status")
async def motion_graphics_status():
    """Plugin install state for the Settings card to poll (every 2s)."""
    from backend.services.hyperframes_service import HyperFramesService
    return HyperFramesService.get_install_state()


@router.post("/settings/motion-graphics/install")
async def motion_graphics_install():
    """Trigger the plugin install (portable Node + npm install) in the
    background. Idempotent; returns immediately. The UI polls status for
    progress."""
    from backend.services.hyperframes_service import HyperFramesService
    return await HyperFramesService.install_plugin()


@router.post("/settings/motion-graphics/uninstall")
async def motion_graphics_uninstall():
    """Remove the entire motion/ plugin dir."""
    from backend.services.hyperframes_service import HyperFramesService
    return await HyperFramesService.uninstall_plugin()


@router.post("/settings/motion-graphics/test")
async def motion_graphics_test():
    """End-to-end smoke render of the bundled kinetic-hook template.

    Confirms the whole chain (portable Node → HyperFrames CLI → headless Chrome
    → FFmpeg) still produces a real MP4. The status is always 200 — the `ok`
    flag carries the verdict, so the UI renders a result rather than an error.
    """
    import time as _time
    from backend.services.hyperframes_service import HyperFramesService
    from backend.services.motion_render_service import MotionRenderService

    if not HyperFramesService.is_installed():
        return {
            "ok": False, "latency_ms": 0, "output_size_kb": None,
            "error": "not_installed",
            "detail": "Motion Graphics isn't installed yet. Click Install above first.",
        }

    start = _time.monotonic()
    try:
        out = await MotionRenderService.render(
            template_id="kinetic_hook",
            variables={
                "kicker": "MOTION GRAPHICS",
                "title": "It Works",
                "subtitle": "rendered locally",
                "accent": "#ffd60a",
                "bg": "#0b0b14",
            },
            aspect="9:16",
            # A verification render, not a deliverable: draft quality and no
            # supersample keep it fast.
            quality="draft",
            supersample=False,
        )
        latency_ms = round((_time.monotonic() - start) * 1000)
        size_kb = round(out.stat().st_size / 1024)
        # Smoke test only — don't keep the output around.
        try:
            out.unlink(missing_ok=True)
        except OSError:
            pass
        return {
            "ok": True, "latency_ms": latency_ms,
            "output_size_kb": size_kb, "error": None, "detail": None,
        }
    except Exception as e:
        latency_ms = round((_time.monotonic() - start) * 1000)
        logger.info(
            "Motion Graphics smoke test failed in %dms: %s: %s",
            latency_ms, type(e).__name__, str(e)[:200],
        )
        return {
            "ok": False, "latency_ms": latency_ms, "output_size_kb": None,
            "error": type(e).__name__, "detail": str(e)[:200],
        }


# ── Voice Studio (Porta 3900) — on-demand Neural Speech & Voice Cloning ────────

@router.get("/settings/voice-studio/status")
async def voice_studio_status():
    """Voice Studio install and daemon running state for the Settings card."""
    from backend.services.voicestudio_service import VoiceStudioService
    state = VoiceStudioService.get_install_state()
    state["running"] = await VoiceStudioService.ping_service()
    return state


@router.post("/settings/voice-studio/install")
async def voice_studio_install():
    """Trigger background installation of Voice Studio neural models."""
    from backend.services.voicestudio_service import VoiceStudioService
    return await VoiceStudioService.install_plugin()


@router.post("/settings/voice-studio/uninstall")
async def voice_studio_uninstall():
    """Remove local Voice Studio models and caches."""
    from backend.services.voicestudio_service import VoiceStudioService
    return await VoiceStudioService.uninstall_plugin()


@router.post("/settings/voice-studio/test")
async def voice_studio_test(voice_id: str = "vs-pt-br-camila"):
    """Generate a test speech take and return latency and status."""
    from backend.services.voicestudio_service import VoiceStudioService
    return await VoiceStudioService.test_voice(voice_id=voice_id)


@router.get("/settings/voice-studio/voices")
async def voice_studio_voices():
    """List available voices in Voice Studio."""
    from backend.services.voicestudio_service import VoiceStudioService
    voices = await VoiceStudioService.get_voice_list()
    return {"ok": True, "voices": voices}
