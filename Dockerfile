# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors

# ── Stage 1: Build Frontend ─────────────────────────
FROM node:20-bookworm-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install --include=dev

COPY frontend/ ./
RUN npm run build

# ── Stage 2: Python Backend Runtime ─────────────────
FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=16888 \
    VIRALMINT_NO_BROWSER=1 \
    DEBIAN_FRONTEND=noninteractive

# System dependencies:
# - ffmpeg: audio & video processing, slicing, concatenation
# - imagemagick: subtitle & caption drawing
# - fonts: required for subtitle styling and rendering
# - build tools & headers: for compiling native Python packages if needed
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    imagemagick \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    fonts-liberation \
    curl \
    git \
    build-essential \
    libffi-dev \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Fix ImageMagick policy to allow font/text rendering for subtitles
RUN if [ -f /etc/ImageMagick-6/policy.xml ]; then \
        sed -i 's/<policy domain="path" rights="none" pattern="@\*"/<!-- & -->/' /etc/ImageMagick-6/policy.xml; \
    fi && \
    if [ -f /etc/ImageMagick-7/policy.xml ]; then \
        sed -i 's/<policy domain="path" rights="none" pattern="@\*"/<!-- & -->/' /etc/ImageMagick-7/policy.xml; \
    fi

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -U pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Copy application backend and configuration
COPY backend/ ./backend/
COPY motion_assets/ ./motion_assets/
COPY pyproject.toml run.py .env.example ./

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Ensure storage directories exist
RUN mkdir -p storage/videos \
             storage/audio \
             storage/generated \
             storage/thumbnails \
             storage/tmp \
             storage/tools/in \
             storage/tools/out

# Persistent volumes for Coolify:
# /app/storage: keeps database (viralmint.db) and downloaded/rendered media
# /root/.cache: keeps downloaded AI models (Whisper, HuggingFace) across container restarts
VOLUME ["/app/storage", "/root/.cache"]

EXPOSE 16888

HEALTHCHECK --interval=30s --timeout=10s --start-period=35s --retries=3 \
  CMD curl -f http://localhost:16888/api/settings/health || exit 1

CMD ["python", "run.py"]
