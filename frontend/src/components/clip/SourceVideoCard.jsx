// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState } from "react"
import { Box, Typography, Stack, Chip, IconButton, Tooltip } from "@mui/material"
import ContentCutIcon from "@mui/icons-material/ContentCut"
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline"
import VideocamIcon from "@mui/icons-material/Videocam"
import { GlassCard } from "../../utils/glassFx"
import { formatTime } from "./clipFormat"

/* ── Source Video Sidebar Item ──────────────────────────────── */

export function posterLadder(video) {
  const canServe = video.thumbnail_available ?? (video.video_exists ?? Boolean(video.video_path))
  const rungs = []
  if (canServe) {
    rungs.push(`/api/downloaded/${video.id}/thumbnail`)
    if (video.video_exists !== false) {
      const t = Math.max(0, (video.duration_seconds || 0) * 0.1).toFixed(1)
      rungs.push(`/api/downloaded/${video.id}/frame?t=${t}&w=320`)
    }
  }
  if (video.thumbnail_url) rungs.push(video.thumbnail_url)
  return rungs
}

export default function SourceVideoCard({ video, clipCount, isSelected, onClick, onPreview }) {
  const rungs = posterLadder(video)
  const [rung, setRung] = useState(0)
  const poster = rungs[rung] || null
  return (
    <GlassCard
      onClick={onClick}
      selected={isSelected}
      sx={{ p: 1.5, cursor: "pointer", borderRadius: 2.5 }}
    >
      {/* Thumbnail */}
      <Box sx={{
        width: "100%", aspectRatio: "16/9", borderRadius: 2, overflow: "hidden",
        bgcolor: "#000", mb: 1, position: "relative",
      }}>
        {poster ? (
          <Box component="img"
            key={poster}
            src={poster}
            alt=""
            loading="lazy" decoding="async"
            sx={{ width: "100%", height: "100%", objectFit: "contain" }}
            onError={() => setRung((r) => r + 1)} />
        ) : (
          <Stack data-testid="source-no-preview" alignItems="center" justifyContent="center" spacing={0.25}
            sx={{ width: "100%", height: "100%" }}>
            <VideocamIcon sx={{ color: "grey.500", fontSize: 24 }} />
            <Typography variant="caption" sx={{ color: "grey.400", fontSize: "0.62rem" }}>
              Sem miniatura
            </Typography>
          </Stack>
        )}
        {/* Duration badge */}
        {video.duration_seconds > 0 && (
          <Chip
            label={formatTime(video.duration_seconds)}
            size="small"
            sx={{
              position: "absolute", bottom: 4, right: 4,
              height: 20, fontSize: "0.65rem", fontWeight: 700,
              bgcolor: "rgba(0,0,0,0.75)", color: "#fff",
              "& .MuiChip-label": { px: 0.75 },
            }}
          />
        )}
        {/* Preview button */}
        {onPreview && (video.video_exists ?? Boolean(video.video_path)) && (
          <Tooltip title="Pré-visualizar vídeo">
            <IconButton
              size="small"
              aria-label="Pré-visualizar vídeo"
              onClick={(e) => { e.stopPropagation(); onPreview(video) }}
              sx={{
                position: "absolute", top: 4, right: 4,
                bgcolor: "rgba(0,0,0,0.6)", color: "#fff",
                "&:hover": { bgcolor: "rgba(0,0,0,0.8)" },
                p: 0.5,
              }}
            >
              <PlayCircleOutlineIcon sx={{ fontSize: 20 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>

      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.8rem", lineHeight: 1.3 }} noWrap>
        {video.title || "Sem título"}
      </Typography>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.5 }}>
        <ContentCutIcon sx={{ fontSize: 13, color: clipCount > 0 ? "primary.main" : "text.disabled" }} />
        <Typography variant="caption" sx={{ color: clipCount > 0 ? "primary.main" : "text.secondary", fontWeight: clipCount > 0 ? 700 : 400 }}>
          {clipCount} {clipCount === 1 ? "clipe" : "clipes"}
        </Typography>
      </Stack>
    </GlassCard>
  )
}

export function MissingSourceRow({ video, busy, onRemove, onRedownload }) {
  return (
    <Box data-testid="missing-source" sx={{
      px: 1, py: 0.75, borderRadius: 1.5, border: 1, borderColor: "divider",
      bgcolor: "background.paper",
    }}>
      <Typography variant="caption" noWrap title={video.title || ""}
        sx={{ display: "block", fontWeight: 700 }}>
        {video.title || "Sem título"}
      </Typography>
      <Typography variant="caption" sx={{ display: "block", color: "warning.main", fontSize: "0.66rem" }}>
        Arquivo ausente no disco
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
        {onRedownload && (
          <Chip size="small" variant="outlined" label="Baixar novamente" disabled={busy}
            onClick={() => onRedownload(video)} sx={{ fontSize: "0.66rem", height: 22 }} />
        )}
        <Chip size="small" variant="outlined" color="error" label="Remover" disabled={busy}
          onClick={() => onRemove(video)} sx={{ fontSize: "0.66rem", height: 22 }} />
      </Stack>
    </Box>
  )
}
