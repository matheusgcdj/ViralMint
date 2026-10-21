// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useCallback, useEffect, useState } from "react"
import { storageKey } from "../../utils/storage"
import useAppStore from "../../store/appStore"

/* ── The per-clip settings both Clipper surfaces share ─────────
   Captions, emoji density, silence trimming, vertical reframing and
   transcription apply per CLIP, identically whether the range came off the
   bench's timeline or the Auto-cut dialog's AI picker.

   One hook, owned once by ClipStudio and handed to both, so the surfaces
   cannot disagree. Persisted per user habit via localStorage so preferences
   (like Groq Cloud Whisper, caption styles, vertical crop) survive browser restarts.
*/

export const CLIP_SETTINGS_DEFAULTS = {
  caption_style: "none",
  emoji_style: "moderate",
  remove_silence: false,
  force_vertical: false,
  whisper_quality: "fast",
  whisper_backend: "groq",
  force_retranscribe: false,
}

export default function useClipSettings() {
  const globalSettings = useAppStore((s) => s.settings)
  const key = storageKey("clipper", "settings")

  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(key) || sessionStorage.getItem(key)
      const saved = raw ? JSON.parse(raw) : null
      const base = { ...CLIP_SETTINGS_DEFAULTS }
      if (globalSettings?.caption_style) {
        base.caption_style = globalSettings.caption_style
      }
      if (globalSettings?.whisper_quality) {
        base.whisper_quality = globalSettings.whisper_quality
      }
      if (globalSettings?.stt_provider) {
        base.whisper_backend = globalSettings.stt_provider
      }
      const merged = saved && typeof saved === "object" ? { ...base, ...saved } : base
      // Se não há preferência local explícita ou estava 'auto', alinha com stt_provider global
      if (globalSettings?.stt_provider && (!saved?.whisper_backend || saved?.whisper_backend === "auto")) {
        merged.whisper_backend = globalSettings.stt_provider
      }
      return merged
    } catch {
      return CLIP_SETTINGS_DEFAULTS
    }
  })

  // Sincroniza quando as configurações globais do backend chegam pela primeira vez
  useEffect(() => {
    if (!globalSettings) return
    setSettings((prev) => {
      let changed = false
      const next = { ...prev }
      const targetBackend = globalSettings.stt_provider || "groq"
      if (prev.whisper_backend === "auto" || (!prev.whisper_backend && targetBackend)) {
        next.whisper_backend = targetBackend
        changed = true
      }
      if (!prev.whisper_quality && globalSettings.whisper_quality) {
        next.whisper_quality = globalSettings.whisper_quality
        changed = true
      }
      return changed ? next : prev
    })
  }, [globalSettings])

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(settings))
    } catch { /* private mode */ }
  }, [key, settings])

  /** Patch one or more fields. */
  const update = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  /** @see clipSettingsPayload — bound to this hook's state. */
  const toPayload = useCallback(
    (opts) => clipSettingsPayload(settings, opts),
    [settings],
  )

  return { settings, update, toPayload }
}

/**
 * The subset every extract request carries, in the shape
 * `ClipStudio.handleExtract` expects.
 */
export function clipSettingsPayload(settings, { hasTranscript = false } = {}) {
  return {
    caption_style: settings.caption_style,
    emoji_style: settings.emoji_style,
    remove_silence: settings.remove_silence,
    force_vertical: settings.force_vertical,
    whisper_quality: settings.whisper_quality || "fast",
    whisper_backend: settings.whisper_backend || "groq",
    force_retranscribe: !hasTranscript || !!settings.force_retranscribe,
  }
}
