/** Shared constants used across Videos page components */

export const STATUS_COLOR = {
  draft: "default", ready: "success", uploading: "warning", uploaded: "info", failed: "error",
}

export const JOB_TYPE_LABEL = { scout: "Scout", download: "Download", generate: "Geração", upload: "Publicação", analyze: "Análise" }
export const JOB_STATUS_COLOR = { running: "info", pending: "default", success: "success", failed: "error", cancelled: "warning" }

export const WHISPER_QUALITIES = [
  { value: "groq_auto", label: "⚡ Groq Whisper Cloud", desc: "~5s via LPU na nuvem (Recomendado)" },
  { value: "fast", label: "Rápido (base)", desc: "~30s por 5min de vídeo" },
  { value: "balanced", label: "Equilibrado (small)", desc: "~90s por 5min de vídeo" },
  { value: "accurate", label: "Preciso (medium)", desc: "~3min por 5min de vídeo" },
  { value: "best", label: "Melhor (large-v3)", desc: "~8min por 5min de vídeo" },
]
