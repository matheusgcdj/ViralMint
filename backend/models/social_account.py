# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Connected social media account entity supporting YouTube, TikTok, Instagram and Kwai."""
from sqlalchemy import Column, String, Text, Boolean, JSON
from backend.database import Base
from backend.models.base import TimestampMixin, UUIDMixin


class SocialAccount(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "social_accounts"

    user_id = Column(String(36), default="local", index=True)
    platform = Column(String(30), nullable=False, index=True)  # youtube | tiktok | instagram | kwai
    
    # Platform-specific unique identifier (e.g. UCxxx, IG-User-ID, TikTok open_id / username)
    account_id = Column(String(200), nullable=True, index=True)
    account_name = Column(String(300), nullable=True)  # Display name / @handle
    avatar_url = Column(Text, nullable=True)
    
    # Encrypted credentials payload (OAuth tokens, refresh tokens, scopes, expiry, cookies)
    credentials_encrypted = Column(Text, nullable=True)
    
    # Raw platform metadata (subscriber count, permissions, etc.)
    metadata_json = Column(JSON, default=dict)
    
    is_active = Column(Boolean, default=True)
