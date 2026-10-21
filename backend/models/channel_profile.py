# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Channel profile entity representing thematic niche channels and automation settings."""
from sqlalchemy import Column, String, Boolean, JSON, Table, ForeignKey, Integer, Float
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import TimestampMixin, UUIDMixin

# Association table for N:M relationship between ChannelProfile and SocialAccount
channel_profile_social_links = Table(
    "channel_profile_social_links",
    Base.metadata,
    Column("channel_profile_id", String(36), ForeignKey("channel_profiles.id", ondelete="CASCADE"), primary_key=True),
    Column("social_account_id", String(36), ForeignKey("social_accounts.id", ondelete="CASCADE"), primary_key=True),
)


class ChannelProfile(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "channel_profiles"

    user_id = Column(String(36), default="local", index=True)
    name = Column(String(100), nullable=False)  # e.g., "Cortes Rápidos - Mistério", "Finanças Diretas"
    
    # Niche identifier: podcast_cuts | curiosities | finance_crypto | horror_mystery | productivity | humor_memes | custom
    niche = Column(String(50), nullable=False, default="podcast_cuts", index=True)
    is_active = Column(Boolean, default=True)

    # Sonic identity (VoiceStudio & Multi-Provider fallback)
    voice_provider = Column(String(30), default="voicestudio")  # voicestudio | elevenlabs | google | edge_tts
    voice_id = Column(String(100), nullable=True)               # Model/clone preset ID
    voice_settings_json = Column(JSON, default=lambda: {
        "speed": 1.0,
        "pitch": 0,
        "reverb": False,
        "stability": 0.75,
    })

    # Visual identity & retention
    caption_style = Column(String(50), default="mrbeast")       # mrbeast | karaoke | highlight | glitch | bold_pop | minimal
    hook_template_ids = Column(JSON, default=list)              # Rotating pool of hook template IDs

    # Scheduling, Timezone & Staggered distribution
    posting_schedule_json = Column(JSON, default=lambda: {
        "timezone": "America/Sao_Paulo",
        "slots": [
            {"days": ["mon", "wed", "fri"], "time": "21:00"},
            {"days": ["tue", "thu"], "time": "18:30"},
        ],
        "stagger_delays_minutes": {
            "tiktok": 0,
            "youtube": 120,
            "instagram": 240,
            "kwai": 360,
        },
    })
    auto_publish = Column(Boolean, default=False)

    # Learning & Performance metrics feedback loop
    performance_metrics = Column(JSON, default=lambda: {
        "total_published": 0,
        "avg_retention_rate": 0.0,
        "best_hook_type": None,
        "best_posting_hour": None,
        "platform_performance": {},
    })

    # Relationships
    accounts = relationship(
        "SocialAccount",
        secondary=channel_profile_social_links,
        backref="channel_profiles",
        lazy="selectin",
    )
