// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
/* ── What Auto-cut will actually cut ───────────────────────────
   Mirrors `auto_clip_count` in backend/api/downloaded.py, pinned across the
   two by tests/test_auto_clip_count_parity.py. If that test is failing, the
   dialog is promising a number the runner will not honour.
*/
export const AUTO_CLIP_SECONDS_PER_CLIP = 30
export const AUTO_CLIP_MIN = 3
export const AUTO_CLIP_MAX = 99
export const AUTO_CLIP_UNKNOWN_DURATION = 5

/** How many clips Auto-cut aims for when the user names no number. */
export function autoClipCount(durationSeconds) {
  if (!durationSeconds || durationSeconds <= 0) return AUTO_CLIP_UNKNOWN_DURATION
  return Math.max(
    AUTO_CLIP_MIN,
    Math.min(AUTO_CLIP_MAX, Math.floor(durationSeconds / AUTO_CLIP_SECONDS_PER_CLIP)),
  )
}

/**
 * The figure to put in front of the user before they press the button.
 */
export function autoCutEstimate({ durationSeconds, requested, minDurationSeconds }) {
  const asked = requested
    ? Math.max(1, Math.min(AUTO_CLIP_MAX, requested))
    : autoClipCount(durationSeconds)
  const floor = minDurationSeconds > 0 ? Math.max(10, minDurationSeconds) : 0
  const fit = floor > 0 && durationSeconds > 0
    ? Math.max(1, Math.floor(durationSeconds / floor))
    : Infinity
  const clips = Math.min(asked, fit)
  return {
    clips,
    label: `até ${clips} ${clips === 1 ? "clipe" : "clipes"}`,
  }
}
