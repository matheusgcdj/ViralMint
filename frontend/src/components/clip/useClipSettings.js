// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useCallback, useEffect, useState } from "react"
import { storageKey } from "../../utils/storage"
import useAppStore from "../../store/appStore"

/* ── The per-clip settings both Clipper surfaces share ─────────
   Captions, emoji density, silence trimming, vertical reframing and
   transcription apply per CLIP, identically whether the range came off the
   bench's timeline or the Auto-cut dialog's AI picker. They were
   duplicated across the two — same four controls, two states — so choosing
   a caption style in one place did nothing in the other, and whichever
   surface you happened to finish in decided the render.

   One hook, owned once by ClipStudio and handed to both, so the surfaces
   cannot disagree. Persisted per user habit via localStorage so preferences
   (like Groq Cloud Whisper, caption styles, vertical crop) survive browser restarts.
*/

export const CLIP_SETTINGS_DEFAULTS = {
  caption_style: "none",
  emoji_style: "moderate",
  remove_silence: false,
  force_vertical: false,
  whisper_quality: "balanced",
  whisper_backend: "auto",
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
      return saved && typeof saved === "object"
        ? { ...base, ...saved }
        : base
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
      if (!prev.whisper_backend && globalSettings.stt_provider) {
        next.whisper_backend = globalSettings.stt_provider
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
    whisper_quality: settings.whisper_quality,
    whisper_backend: settings.whisper_backend || "auto",
    force_retranscribe: !hasTranscript || !!settings.force_retranscribe,
  }
}
