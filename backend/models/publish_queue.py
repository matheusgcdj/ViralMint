# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Publish queue entity managing multi-platform distribution, stagger delays and retry handling."""
from datetime import datetime
from sqlalchemy import Column, String, Integer, Float, DateTime, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base
from backend.models.base import TimestampMixin, UUIDMixin


class PublishQueue(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "publish_queue"

    user_id = Column(String(36), default="local", index=True)
    
    # Associated generated video and channel profile
    video_id = Column(String(36), ForeignKey("generated_videos.id", ondelete="CASCADE"), nullable=False, index=True)
    channel_profile_id = Column(String(36), ForeignKey("channel_profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    social_account_id = Column(String(36), ForeignKey("social_accounts.id", ondelete="CASCADE"), nullable=False, index=True)

    platform = Column(String(30), nullable=False, index=True)  # youtube | tiktok | instagram | kwai
    
    # Status lifecycle: pending | queued | publishing | published | failed | cancelled
    status = Column(String(30), default="pending", index=True)
    
    # Scheduled execution datetime (UTC)
    scheduled_for = Column(DateTime, default=datetime.utcnow, index=True)
    published_at = Column(DateTime, nullable=True)
    
    # Calculated algorithmic priority (0 - 100) based on virality, hook score and freshness decay
    priority = Column(Float, default=50.0)
    
    # Payload prepared for target platform (title, description, tags, hashtags, thumbnail path, overrides)
    payload_json = Column(JSON, default=dict)
    
    # Execution result
    external_post_id = Column(String(200), nullable=True)  # e.g., YouTube video ID, TikTok item ID, IG post ID
    external_post_url = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)

    # Relationships
    video = relationship("GeneratedVideo", lazy="selectin")
    channel_profile = relationship("ChannelProfile", lazy="selectin")
    social_account = relationship("SocialAccount", lazy="selectin")
