// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { Box, Typography, Stack, Tooltip, LinearProgress } from "@mui/material"
import { GlassPanel } from "../../utils/glassFx"
import WhatshotIcon from "@mui/icons-material/Whatshot"

const FACTOR_META = {
  hook: {
    label: "Gancho",
    blurb: "Os primeiros 2-3 segundos prendem a atenção? Avaliado na primeira frase.",
  },
  flow: {
    label: "Fluidez",
    blurb: "Arco narrativo lógico com desfecho satisfatório — sem pensamentos soltos.",
  },
  value: {
    label: "Valor",
    blurb: "Ressonância emocional ou prática — revelação, conselho aplicável, reação imediata.",
  },
  trend: {
    label: "Tendência",
    blurb: "Alinhamento com o que o público está consumindo e clicando neste nicho.",
  },
  shareability: {
    label: "Compartilhamento",
    blurb: "O espectador citaria, tiraria print ou enviaria este corte para um amigo?",
  },
}

export function parseScoreBreakdown(clip) {
  const raw = clip?.clip_score_breakdown ?? clip?.clip_score_breakdown_json
  if (!raw) return null
  if (typeof raw === "object") return raw
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? parsed : null
  } catch {
    return null
  }
}

function scoreColor(score) {
  if (score == null) return "grey"
  if (score >= 8) return "success.main"
  if (score >= 6) return "warning.main"
  return "text.disabled"
}

function ScoreBar({ factor, score }) {
  const meta = FACTOR_META[factor]
  if (!meta) return null
  const pct = score == null ? 0 : Math.max(0, Math.min(score, 10)) * 10
  const color = scoreColor(score)
  return (
    <Tooltip title={meta.blurb} arrow placement="top">
      <Box sx={{ cursor: "default" }}>
        <Stack direction="row" justifyContent="space-between" spacing={0.75} sx={{ mb: 0.25, whiteSpace: "nowrap" }}>
          <Typography variant="caption" sx={{ fontWeight: 600, fontSize: "0.7rem" }}>
            {meta.label}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, fontSize: "0.7rem", color }}>
            {score == null ? "—" : score.toFixed(1)}
          </Typography>
        </Stack>
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 5, borderRadius: 3,
            bgcolor: (t) => t.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
            "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 3 },
          }}
        />
      </Box>
    </Tooltip>
  )
}

export default function ScoreBreakdownPanel({ clip }) {
  if (!clip) return null
  const hook = clip.clip_hook_score
  const breakdown = parseScoreBreakdown(clip)
  if (hook == null && !breakdown) return null

  const factors = [
    { key: "hook", score: hook },
    { key: "flow", score: breakdown?.flow },
    { key: "value", score: breakdown?.value },
    { key: "trend", score: breakdown?.trend },
    { key: "shareability", score: breakdown?.shareability },
  ]

  return (
    <GlassPanel sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction="row" alignItems="center" columnGap={1} rowGap={0.25} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ whiteSpace: "nowrap" }}>
          <WhatshotIcon sx={{ fontSize: 16, color: "primary.main" }} />
          <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 700, fontSize: "0.65rem", lineHeight: 1.6 }}>
            Painel de Viralidade
          </Typography>
        </Stack>
        {clip.clip_virality_score != null && (
          <>
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption" sx={{ color: "text.secondary", fontSize: "0.7rem", whiteSpace: "nowrap" }}>
              Geral: <strong>{clip.clip_virality_score.toFixed(1)}</strong>/10
            </Typography>
          </>
        )}
      </Stack>
      <Box sx={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(78px, 1fr))",
        gap: 1.5,
      }}>
        {factors.map(({ key, score }) => (
          <ScoreBar key={key} factor={key} score={score} />
        ))}
      </Box>
      {clip.clip_virality_reason && (
        <Typography variant="caption" sx={{ display: "block", mt: 1.5, color: "text.secondary", fontStyle: "italic", fontSize: "0.78rem", lineHeight: 1.5 }}>
          {clip.clip_virality_reason}
        </Typography>
      )}
    </GlassPanel>
  )
}
