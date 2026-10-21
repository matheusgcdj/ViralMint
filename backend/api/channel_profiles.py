# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""
REST API for Channel Profiles (Niche Channels) & Social Accounts.
Supports many-to-many relationship between ChannelProfile and SocialAccount,
dynamic Niche Presets, and automatic migration from UserSettings OAuth keys.
"""
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query, Body
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from backend.database import AsyncSessionLocal
from backend.models.channel_profile import ChannelProfile, channel_profile_social_links
from backend.models.social_account import SocialAccount
from backend.models.user_settings import UserSettings
from backend.core.niche_presets import NICHE_PRESETS
from backend.core.crypto import decrypt, encrypt

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/channel-profiles", tags=["channel-profiles"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class SocialAccountCreate(BaseModel):
    platform: str
    account_id: Optional[str] = None
    account_name: Optional[str] = None
    avatar_url: Optional[str] = None
    credentials: Optional[Dict[str, Any]] = None
    metadata_json: Optional[Dict[str, Any]] = None


class ChannelProfileCreate(BaseModel):
    name: str
    niche: str = "podcast_cuts"
    is_active: bool = True
    voice_provider: Optional[str] = None
    voice_id: Optional[str] = None
    voice_settings_json: Optional[Dict[str, Any]] = None
    caption_style: Optional[str] = None
    hook_template_ids: Optional[List[str]] = None
    posting_schedule_json: Optional[Dict[str, Any]] = None
    auto_publish: bool = False
    account_ids: Optional[List[str]] = Field(default_factory=list)


class ChannelProfileUpdate(BaseModel):
    name: Optional[str] = None
    niche: Optional[str] = None
    is_active: Optional[bool] = None
    voice_provider: Optional[str] = None
    voice_id: Optional[str] = None
    voice_settings_json: Optional[Dict[str, Any]] = None
    caption_style: Optional[str] = None
    hook_template_ids: Optional[List[str]] = None
    posting_schedule_json: Optional[Dict[str, Any]] = None
    auto_publish: Optional[bool] = None
    account_ids: Optional[List[str]] = None


# ── Helpers ──────────────────────────────────────────────────────────────────

async def _auto_sync_social_accounts_from_settings(db, user_id: str = "local"):
    """Idempotently sync legacy OAuth credentials from UserSettings to SocialAccount."""
    res = await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    settings = res.scalar_one_or_none()
    if not settings:
        return

    # 1. YouTube
    if settings.youtube_credentials_json_encrypted or settings.youtube_channel_title:
        q = select(SocialAccount).where(SocialAccount.user_id == user_id, SocialAccount.platform == "youtube")
        existing = (await db.execute(q)).scalar_one_or_none()
        if not existing:
            account = SocialAccount(
                user_id=user_id,
                platform="youtube",
                account_id=settings.my_youtube_channel_id,
                account_name=settings.youtube_channel_title or "Canal YouTube Conectado",
                credentials_encrypted=settings.youtube_credentials_json_encrypted,
                metadata_json={"source": "user_settings_migration"},
            )
            db.add(account)

    # 2. TikTok
    if settings.tiktok_upload_token_encrypted or settings.tiktok_cookie_encrypted:
        q = select(SocialAccount).where(SocialAccount.user_id == user_id, SocialAccount.platform == "tiktok")
        existing = (await db.execute(q)).scalar_one_or_none()
        if not existing:
            account = SocialAccount(
                user_id=user_id,
                platform="tiktok",
                account_name="Conta TikTok Conectada",
                credentials_encrypted=settings.tiktok_upload_token_encrypted or settings.tiktok_cookie_encrypted,
                metadata_json={"source": "user_settings_migration"},
            )
            db.add(account)

    # 3. Instagram Reels
    if settings.instagram_access_token_encrypted or settings.instagram_account_name:
        q = select(SocialAccount).where(SocialAccount.user_id == user_id, SocialAccount.platform == "instagram")
        existing = (await db.execute(q)).scalar_one_or_none()
        if not existing:
            account = SocialAccount(
                user_id=user_id,
                platform="instagram",
                account_id=settings.instagram_user_id,
                account_name=settings.instagram_account_name or "Conta Instagram Reels",
                credentials_encrypted=settings.instagram_access_token_encrypted,
                metadata_json={"source": "user_settings_migration"},
            )
            db.add(account)

    await db.commit()


# ── Presets Endpoint ─────────────────────────────────────────────────────────

@router.get("/presets")
async def get_niche_presets():
    """Return all strategic presets and hook banks by niche."""
    return {
        "ok": True,
        "niches": NICHE_PRESETS,
    }


# ── Social Accounts Endpoints ────────────────────────────────────────────────

@router.get("/accounts")
async def list_social_accounts(platform: Optional[str] = None, user_id: str = "local"):
    """List connected social media accounts."""
    async with AsyncSessionLocal() as db:
        await _auto_sync_social_accounts_from_settings(db, user_id)
        q = select(SocialAccount).where(SocialAccount.user_id == user_id)
        if platform:
            q = q.where(SocialAccount.platform == platform)
        q = q.order_by(SocialAccount.created_at.desc())
        accounts = (await db.execute(q)).scalars().all()

        return {
            "ok": True,
            "accounts": [
                {
                    "id": a.id,
                    "platform": a.platform,
                    "account_id": a.account_id,
                    "account_name": a.account_name,
                    "avatar_url": a.avatar_url,
                    "is_active": a.is_active,
                    "metadata": a.metadata_json,
                    "has_credentials": bool(a.credentials_encrypted),
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                }
                for a in accounts
            ],
        }


@router.post("/accounts")
async def create_social_account(payload: SocialAccountCreate, user_id: str = "local"):
    """Register or link a new social media account."""
    async with AsyncSessionLocal() as db:
        cred_encrypted = None
        if payload.credentials:
            import json
            cred_encrypted = encrypt(json.dumps(payload.credentials))

        account = SocialAccount(
            user_id=user_id,
            platform=payload.platform.lower().strip(),
            account_id=payload.account_id,
            account_name=payload.account_name,
            avatar_url=payload.avatar_url,
            credentials_encrypted=cred_encrypted,
            metadata_json=payload.metadata_json or {},
            is_active=True,
        )
        db.add(account)
        await db.commit()
        await db.refresh(account)

        return {
            "ok": True,
            "account": {
                "id": account.id,
                "platform": account.platform,
                "account_id": account.account_id,
                "account_name": account.account_name,
                "avatar_url": account.avatar_url,
                "is_active": account.is_active,
            },
        }


@router.delete("/accounts/{account_id}")
async def delete_social_account(account_id: str, user_id: str = "local"):
    """Delete a social account."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(SocialAccount).where(SocialAccount.id == account_id, SocialAccount.user_id == user_id)
        )
        account = res.scalar_one_or_none()
        if not account:
            raise HTTPException(status_code=404, detail="Social account not found")

        await db.delete(account)
        await db.commit()
        return {"ok": True, "message": "Conta social removida com sucesso"}


# ── Channel Profiles Endpoints ───────────────────────────────────────────────

@router.get("")
async def list_channel_profiles(user_id: str = "local"):
    """List all thematic channel profiles with linked accounts."""
    async with AsyncSessionLocal() as db:
        q = (
            select(ChannelProfile)
            .where(ChannelProfile.user_id == user_id)
            .options(selectinload(ChannelProfile.accounts))
            .order_by(ChannelProfile.created_at.desc())
        )
        profiles = (await db.execute(q)).scalars().all()

        return {
            "ok": True,
            "profiles": [
                {
                    "id": p.id,
                    "name": p.name,
                    "niche": p.niche,
                    "is_active": p.is_active,
                    "voice_provider": p.voice_provider,
                    "voice_id": p.voice_id,
                    "voice_settings": p.voice_settings_json,
                    "caption_style": p.caption_style,
                    "hook_template_ids": p.hook_template_ids or [],
                    "posting_schedule": p.posting_schedule_json,
                    "auto_publish": p.auto_publish,
                    "performance_metrics": p.performance_metrics,
                    "accounts": [
                        {
                            "id": a.id,
                            "platform": a.platform,
                            "account_name": a.account_name,
                            "account_id": a.account_id,
                            "avatar_url": a.avatar_url,
                        }
                        for a in p.accounts
                    ],
                    "created_at": p.created_at.isoformat() if p.created_at else None,
                }
                for p in profiles
            ],
        }


@router.post("")
async def create_channel_profile(payload: ChannelProfileCreate, user_id: str = "local"):
    """Create a new channel profile populated with niche defaults if not explicitly specified."""
    async with AsyncSessionLocal() as db:
        niche_key = payload.niche.lower().strip()
        preset = NICHE_PRESETS.get(niche_key, {})

        # Populate with defaults from preset when omitted
        voice_provider = payload.voice_provider or preset.get("voice_provider", "voicestudio")
        voice_settings = payload.voice_settings_json or preset.get("voice_settings", {
            "speed": 1.0, "pitch": 0, "reverb": False, "stability": 0.75
        })
        caption_style = payload.caption_style or preset.get("caption_style", "mrbeast")

        posting_schedule = payload.posting_schedule_json or {
            "timezone": "America/Sao_Paulo",
            "slots": preset.get("default_slots", [
                {"days": ["mon", "wed", "fri"], "time": "21:00"}
            ]),
            "stagger_delays_minutes": preset.get("stagger_delays_minutes", {
                "tiktok": 0, "youtube": 120, "instagram": 240, "kwai": 360
            }),
        }

        # Resolve linked accounts
        linked_accounts = []
        if payload.account_ids:
            acc_q = select(SocialAccount).where(
                SocialAccount.id.in_(payload.account_ids),
                SocialAccount.user_id == user_id,
            )
            linked_accounts = (await db.execute(acc_q)).scalars().all()

        profile = ChannelProfile(
            user_id=user_id,
            name=payload.name.strip(),
            niche=niche_key,
            is_active=payload.is_active,
            voice_provider=voice_provider,
            voice_id=payload.voice_id,
            voice_settings_json=voice_settings,
            caption_style=caption_style,
            hook_template_ids=payload.hook_template_ids or [],
            posting_schedule_json=posting_schedule,
            auto_publish=payload.auto_publish,
            accounts=linked_accounts,
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

        return {
            "ok": True,
            "profile": {
                "id": profile.id,
                "name": profile.name,
                "niche": profile.niche,
                "is_active": profile.is_active,
                "voice_provider": profile.voice_provider,
                "voice_id": profile.voice_id,
                "voice_settings": profile.voice_settings_json,
                "caption_style": profile.caption_style,
                "hook_template_ids": profile.hook_template_ids,
                "posting_schedule": profile.posting_schedule_json,
                "auto_publish": profile.auto_publish,
                "account_count": len(profile.accounts),
            },
        }


@router.get("/{profile_id}")
async def get_channel_profile(profile_id: str, user_id: str = "local"):
    """Get single channel profile details with accounts."""
    async with AsyncSessionLocal() as db:
        q = (
            select(ChannelProfile)
            .where(ChannelProfile.id == profile_id, ChannelProfile.user_id == user_id)
            .options(selectinload(ChannelProfile.accounts))
        )
        profile = (await db.execute(q)).scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=404, detail="Perfil de canal não encontrado")

        return {
            "ok": True,
            "profile": {
                "id": profile.id,
                "name": profile.name,
                "niche": profile.niche,
                "is_active": profile.is_active,
                "voice_provider": profile.voice_provider,
                "voice_id": profile.voice_id,
                "voice_settings": profile.voice_settings_json,
                "caption_style": profile.caption_style,
                "hook_template_ids": profile.hook_template_ids or [],
                "posting_schedule": profile.posting_schedule_json,
                "auto_publish": profile.auto_publish,
                "performance_metrics": profile.performance_metrics,
                "accounts": [
                    {
                        "id": a.id,
                        "platform": a.platform,
                        "account_name": a.account_name,
                        "account_id": a.account_id,
                        "avatar_url": a.avatar_url,
                    }
                    for a in profile.accounts
                ],
            },
        }


@router.put("/{profile_id}")
async def update_channel_profile(profile_id: str, payload: ChannelProfileUpdate, user_id: str = "local"):
    """Update channel profile parameters and account links."""
    async with AsyncSessionLocal() as db:
        q = (
            select(ChannelProfile)
            .where(ChannelProfile.id == profile_id, ChannelProfile.user_id == user_id)
            .options(selectinload(ChannelProfile.accounts))
        )
        profile = (await db.execute(q)).scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=404, detail="Perfil de canal não encontrado")

        if payload.name is not None:
            profile.name = payload.name.strip()
        if payload.niche is not None:
            profile.niche = payload.niche.strip().lower()
        if payload.is_active is not None:
            profile.is_active = payload.is_active
        if payload.voice_provider is not None:
            profile.voice_provider = payload.voice_provider
        if payload.voice_id is not None:
            profile.voice_id = payload.voice_id
        if payload.voice_settings_json is not None:
            profile.voice_settings_json = payload.voice_settings_json
        if payload.caption_style is not None:
            profile.caption_style = payload.caption_style
        if payload.hook_template_ids is not None:
            profile.hook_template_ids = payload.hook_template_ids
        if payload.posting_schedule_json is not None:
            profile.posting_schedule_json = payload.posting_schedule_json
        if payload.auto_publish is not None:
            profile.auto_publish = payload.auto_publish

        if payload.account_ids is not None:
            acc_q = select(SocialAccount).where(
                SocialAccount.id.in_(payload.account_ids),
                SocialAccount.user_id == user_id,
            )
            profile.accounts = (await db.execute(acc_q)).scalars().all()

        await db.commit()
        await db.refresh(profile)

        return {"ok": True, "message": "Perfil atualizado com sucesso"}


@router.delete("/{profile_id}")
async def delete_channel_profile(profile_id: str, user_id: str = "local"):
    """Delete a channel profile."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(ChannelProfile).where(ChannelProfile.id == profile_id, ChannelProfile.user_id == user_id)
        )
        profile = res.scalar_one_or_none()
        if not profile:
            raise HTTPException(status_code=404, detail="Perfil de canal não encontrado")

        await db.delete(profile)
        await db.commit()
        return {"ok": True, "message": "Perfil excluído com sucesso"}
