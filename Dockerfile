# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors

# ── Stage 1: Build Frontend ─────────────────────────
FROM node:22-bookworm-slim AS frontend-builder
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
    DEBIAN_FRONTEND=noninteractive \
    HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium \
    VIRALMINT_DATA_DIR=/app/storage

# System dependencies:
# - ffmpeg: audio & video processing, slicing, concatenation
# - imagemagick: subtitle & caption drawing
# - fonts: required for subtitle styling and rendering
# - build tools & headers: for compiling native Python packages if needed
# - chromium: headless browser for Motion Graphics (HyperFrames / Puppeteer)
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
    chromium \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/*

# Fix ImageMagick policy to allow font/text rendering for subtitles
RUN if [ -f /etc/ImageMagick-6/policy.xml ]; then \
        sed -i 's/<policy domain="path" rights="none" pattern="@\*"/<!-- & -->/' /etc/ImageMagick-6/policy.xml; \
    fi && \
    if [ -f /etc/ImageMagick-7/policy.xml ]; then \
        sed -i 's/<policy domain="path" rights="none" pattern="@\*"/<!-- & -->/' /etc/ImageMagick-7/policy.xml; \
    fi

WORKDIR /app

# Copy Node 22 runtime and npm from frontend-builder stage for motion graphics & tooling
COPY --from=frontend-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=frontend-builder /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm

# Pre-install Motion Graphics engine (HyperFrames + GSAP)
# This bakes the motion rendering engine directly into the Docker image so it is
# immediately ready out of the box without requiring manual download or losing it on redeploy.
RUN mkdir -p /app/motion/hyperframes && \
    cd /app/motion/hyperframes && \
    npm init -y && \
    npm install --no-audit --no-fund --save-exact hyperframes@0.7.111 gsap@3.14.2 && \
    rm -rf node_modules/onnxruntime-node && \
    echo '{"hyperframes_version": "0.7.111", "node_version": "22.14.0", "gsap_version": "3.14.2", "installed_at": 1740000000.0}' > /app/motion/.installed && \
    mkdir -p /app/motion/node/node-v22.14.0-linux-x64/bin && \
    ln -s /usr/local/bin/node /app/motion/node/node-v22.14.0-linux-x64/bin/node

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
             storage/tools/out \
             storage/studio \
             storage/cache

# Persistent volumes for Coolify:
# /app/storage: keeps database (viralmint.db), .env secrets, cookies, studio and media
# /root/.cache: keeps downloaded AI models (Whisper, HuggingFace) across container restarts
VOLUME ["/app/storage", "/root/.cache"]

EXPOSE 16888

HEALTHCHECK --interval=30s --timeout=10s --start-period=35s --retries=3 \
  CMD curl -f http://localhost:16888/api/settings/health || exit 1

CMD ["python", "run.py"]
