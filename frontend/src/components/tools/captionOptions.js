// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
/**
 * Shared caption + emoji enums for the tool pages and Clip Studio.
 *
 * The VALUES are the contract: they must match the keys of
 * backend/services/caption_service.py CAPTION_STYLES, minus `brainrot` (a look
 * applied by its own pipeline, not a general preset).
 * tests/test_caption_styles_parity.py fails if the two drift.
 */
export const CAPTION_STYLES = [
  {
    value: "viral", label: "Viral", description: "Destaque amarelo, frases de ~6 palavras",
    preview: { text: "#fff", highlight: "#ffff00", outline: "#000", font: "Arial, Helvetica, sans-serif", weight: 700, words: 6 },
  },
  {
    value: "classic", label: "Clássico", description: "Frase completa, sem destaque",
    preview: { text: "#fff", highlight: "#fff", outline: "#000", font: "Arial, Helvetica, sans-serif", weight: 400, words: 8 },
  },
  {
    value: "bold", label: "Negrito (Impact)", description: "Destaque verde, frases curtas de ~4 palavras",
    preview: { text: "#fff", highlight: "#00ff00", outline: "#000", font: "Impact, 'Haettenschweiler', sans-serif", weight: 400, words: 4 },
  },
  {
    value: "neon", label: "Neon", description: "Texto rosa, destaque amarelo, ~6 palavras",
    preview: { text: "#ffaaff", highlight: "#ffff00", outline: "#330033", font: "Arial, Helvetica, sans-serif", weight: 700, words: 6 },
  },
  {
    value: "minimal", label: "Minimalista", description: "Arial limpo, linhas longas, sem destaque",
    preview: { text: "#fff", highlight: "#fff", outline: "#333", font: "Arial, Helvetica, sans-serif", weight: 400, words: 10 },
  },
  {
    value: "karaoke", label: "Karaokê", description: "Texto cinza que acende palavra por palavra",
    preview: { text: "#aaaaaa", highlight: "#ffff00", outline: "#000", font: "Arial, Helvetica, sans-serif", weight: 700, words: 7 },
  },
  {
    value: "glow", label: "Brilho Glow", description: "Brilho laranja suave, frases de ~6 palavras",
    preview: { text: "#fff", highlight: "#ffcc66", outline: "#cc6600", font: "Arial, Helvetica, sans-serif", weight: 700, words: 6 },
  },
  {
    value: "urban", label: "Urbano Marcante", description: "Arial Black, frases diretas de ~3 palavras",
    preview: { text: "#fff", highlight: "#ff8c00", outline: "#000", font: "'Arial Black', Arial, sans-serif", weight: 900, words: 3 },
  },
  {
    value: "warm", label: "Tons Quentes", description: "Georgia serif, tom creme aconchegante",
    preview: { text: "#fff5e1", highlight: "#ffc878", outline: "#3c1e0a", font: "Georgia, 'Times New Roman', serif", weight: 400, words: 5 },
  },
  {
    value: "mono", label: "Monocromático", description: "Verdana, destaque cinza sóbrio",
    preview: { text: "#fff", highlight: "#c8c8c8", outline: "#141414", font: "Verdana, Geneva, sans-serif", weight: 400, words: 5 },
  },
]

// The label a caption style id is shown by
export const captionStyleLabel = (id) =>
  (id && CAPTION_STYLES.find((s) => s.value === id)?.label) || id || ""

export const EMOJI_LEVELS = [
  { value: "none", label: "Desativado" },
  { value: "minimal", label: "Mínimo" },
  { value: "moderate", label: "Moderado" },
  { value: "heavy", label: "Intenso" },
]
