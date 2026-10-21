// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { formatClock } from "../../utils/format"

/**
 * Timecode do Estúdio de Cortes — "1:30:00" / "2:51", ou "--:--" quando desconhecido.
 */
export function formatTime(seconds) {
  return formatClock(seconds, { fallback: "--:--" })
}

export function viralityColor(score) {
  if (score >= 8) return "success"
  if (score >= 6) return "warning"
  return "default"
}

export function viralityLabel(score) {
  if (score >= 9) return "Viral"
  if (score >= 8) return "Forte"
  if (score >= 6) return "Bom"
  if (score >= 4) return "Médio"
  return "Baixo"
}

const HOOK_TYPE_LABEL = {
  curiosity_gap:   "Lacuna de Curiosidade",
  contrarian:      "Contraintuitivo",
  emotional_peak:  "Pico Emocional",
  question:        "Pergunta Gancho",
  number_promise:  "Promessa com Números",
  story_loop:      "Loop Narrativo",
  actionable_tip:  "Dica Prática",
  shocking_claim:  "Afirmação Chocante",
}

export function hookTypeLabel(t) {
  if (!t || t === "general") return null
  return HOOK_TYPE_LABEL[t] || null
}

export function clipAspectCss(aspect) {
  const [w, h] = String(aspect || "").split(":").map(Number)
  if (!(w > 0) || !(h > 0)) return "9 / 16"
  return `${w} / ${h}`
}
