# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""
REST API for Publish Queue.
Handles automated staggered scheduling, priority queue management,
and multi-platform dispatching (YouTube, TikTok, Instagram, Kwai).
"""
import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from backend.database import AsyncSessionLocal
from backend.models.publish_queue import PublishQueue
from backend.models.channel_profile import ChannelProfile
from backend.models.social_account import SocialAccount
from backend.models.generated_video import GeneratedVideo
from backend.core.niche_presets import calculate_publication_priority

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/publish-queue", tags=["publish-queue"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class ScheduleItemRequest(BaseModel):
    video_id: str
    channel_profile_id: Optional[str] = None
    social_account_ids: Optional[List[str]] = None
    scheduled_for: Optional[datetime] = None
    priority_override: Optional[float] = None
    is_evergreen: bool = False
    custom_title: Optional[str] = None
    custom_description: Optional[str] = None
    custom_tags: Optional[List[str]] = None


class QueueItemUpdate(BaseModel):
    scheduled_for: Optional[datetime] = None
    priority: Optional[float] = None
    status: Optional[str] = None
    payload: Optional[Dict[str, Any]] = None


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("")
async def list_publish_queue(
    status: Optional[str] = None,
    platform: Optional[str] = None,
    limit: int = 50,
    user_id: str = "local",
):
    """List queue items ordered by priority and scheduled date."""
    async with AsyncSessionLocal() as db:
        q = (
            select(PublishQueue)
            .where(PublishQueue.user_id == user_id)
            .options(
                selectinload(PublishQueue.video),
                selectinload(PublishQueue.channel_profile),
                selectinload(PublishQueue.social_account),
            )
        )
        if status:
            q = q.where(PublishQueue.status == status)
        if platform:
            q = q.where(PublishQueue.platform == platform)

        q = q.order_by(PublishQueue.status.asc(), PublishQueue.priority.desc(), PublishQueue.scheduled_for.asc())
        q = q.limit(limit)

        items = (await db.execute(q)).scalars().all()

        return {
            "ok": True,
            "items": [
                {
                    "id": item.id,
                    "video_id": item.video_id,
                    "video_title": item.video.title if item.video else None,
                    "thumbnail_path": item.video.thumbnail_path if item.video else None,
                    "video_path": item.video.video_path if item.video else None,
                    "channel_profile_id": item.channel_profile_id,
                    "channel_profile_name": item.channel_profile.name if item.channel_profile else None,
                    "social_account_id": item.social_account_id,
                    "social_account_name": item.social_account.account_name if item.social_account else None,
                    "platform": item.platform,
                    "status": item.status,
                    "priority": item.priority,
                    "scheduled_for": item.scheduled_for.isoformat() if item.scheduled_for else None,
                    "published_at": item.published_at.isoformat() if item.published_at else None,
                    "external_post_url": item.external_post_url,
                    "retry_count": item.retry_count,
                    "error_message": item.error_message,
                    "payload": item.payload_json,
                }
                for item in items
            ],
        }


@router.post("/schedule")
async def schedule_video_publication(payload: ScheduleItemRequest, user_id: str = "local"):
    """Schedule video publication across accounts linked to channel profile with stagger delay."""
    async with AsyncSessionLocal() as db:
        # 1. Fetch Video
        v_res = await db.execute(select(GeneratedVideo).where(GeneratedVideo.id == payload.video_id))
        video = v_res.scalar_one_or_none()
        if not video:
            raise HTTPException(status_code=404, detail="Vídeo gerado não encontrado")

        # 2. Fetch Channel Profile or specific accounts
        profile = None
        accounts = []
        if payload.channel_profile_id:
            p_res = await db.execute(
                select(ChannelProfile)
                .where(ChannelProfile.id == payload.channel_profile_id, ChannelProfile.user_id == user_id)
                .options(selectinload(ChannelProfile.accounts))
            )
            profile = p_res.scalar_one_or_none()
            if profile and profile.accounts:
                accounts = list(profile.accounts)

        # Fallback to direct social_account_ids if provided
        if payload.social_account_ids:
            a_res = await db.execute(
                select(SocialAccount).where(
                    SocialAccount.id.in_(payload.social_account_ids),
                    SocialAccount.user_id == user_id,
                )
            )
            accounts = (a_res).scalars().all()

        if not accounts:
            raise HTTPException(
                status_code=400,
                detail="Nenhuma conta de rede social conectada foi vinculada a este perfil ou agendamento.",
            )

        # 3. Calculate priority with freshness decay
        virality_score = getattr(video, "clip_virality_score", 7.0) or 7.0
        hook_score = getattr(video, "clip_hook_score", 7.0) or 7.0
        priority = payload.priority_override or calculate_publication_priority(
            virality_score=virality_score,
            hook_score=hook_score,
            hours_since_trending=0.0,
            is_evergreen=payload.is_evergreen,
        )

        # 4. Resolve Stagger delays
        schedule_conf = (profile.posting_schedule_json or {}) if profile else {}
        stagger_delays = schedule_conf.get("stagger_delays_minutes", {
            "tiktok": 0, "youtube": 120, "instagram": 240, "kwai": 360
        })

        base_time = payload.scheduled_for or datetime.utcnow()
        created_items = []

        for acc in accounts:
            delay_min = stagger_delays.get(acc.platform.lower(), 0)
            account_scheduled_time = base_time + timedelta(minutes=delay_min)

            item = PublishQueue(
                user_id=user_id,
                video_id=video.id,
                channel_profile_id=profile.id if profile else None,
                social_account_id=acc.id,
                platform=acc.platform.lower(),
                status="pending",
                scheduled_for=account_scheduled_time,
                priority=priority,
                payload_json={
                    "title": payload.custom_title or video.title,
                    "description": payload.custom_description or getattr(video, "script", ""),
                    "tags": payload.custom_tags or [],
                    "thumbnail_path": video.thumbnail_path,
                    "video_path": video.video_path,
                },
            )
            db.add(item)
            created_items.append(item)

        await db.commit()

        return {
            "ok": True,
            "scheduled_count": len(created_items),
            "priority": priority,
            "message": f"{len(created_items)} publicação(ões) agendada(s) com sucesso com escalonamento anti-canibalização.",
        }


@router.delete("/{item_id}")
async def cancel_queue_item(item_id: str, user_id: str = "local"):
    """Cancel or remove an item from publish queue."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(PublishQueue).where(PublishQueue.id == item_id, PublishQueue.user_id == user_id)
        )
        item = res.scalar_one_or_none()
        if not item:
            raise HTTPException(status_code=404, detail="Item da fila não encontrado")

        await db.delete(item)
        await db.commit()
        return {"ok": True, "message": "Publicação cancelada e removida da fila"}
