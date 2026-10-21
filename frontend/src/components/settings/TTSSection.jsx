// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState } from "react"
import {
  Box, Stack, Typography, Chip, ToggleButtonGroup, ToggleButton,
  alpha,
} from "@mui/material"
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline"
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOverOutlined"
import VolumeUpIcon from "@mui/icons-material/VolumeUpOutlined"
import CloudIcon from "@mui/icons-material/CloudOutlined"

const TTS_PROVIDERS = [
  {
    id: "edge_tts",
    label: "Edge TTS",
    hint: "Vozes neurais Microsoft — gratuito, sem chave",
    needsKey: false,
    color: "#0078D4",
  },
  {
    id: "openai_tts",
    label: "OpenAI TTS",
    hint: "Vozes de alta qualidade — usa sua chave da OpenAI",
    needsKey: true,
    keyFlag: "ai_api_key_set",
    color: "#10A37F",
  },
  {
    id: "google_tts",
    label: "Google Cloud TTS",
    hint: "Vozes neurais Google — suporta pool de chaves",
    needsKey: true,
    keyFlag: "google_tts_api_key_set",
    color: "#4285F4",
  },
]

/**
 * Settings section for TTS (Text-to-Speech) engine configuration.
 * Lets the user choose the default TTS provider for narration.
 */
export default function TTSSection({ settings, updateSettings }) {
  const [saving, setSaving] = useState(false)
  const currentProvider = settings?.tts_provider || "edge_tts"

  const handleProviderChange = async (_, providerId) => {
    if (!providerId || providerId === currentProvider || saving) return
    setSaving(true)
    try {
      await updateSettings({ tts_provider: providerId })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Stack spacing={2.5}>
      <Typography variant="body2" color="text.secondary">
        Escolha o provedor padrão de narração por voz. Edge TTS funciona sem nenhuma chave de API.
        Para usar OpenAI TTS, configure sua chave na seção "Provedor de IA".
        Para Google Cloud TTS, configure a(s) chave(s) na seção "Chaves de API".
      </Typography>

      {/* Provider selector */}
      <Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
          <VolumeUpIcon sx={{ color: "text.secondary", fontSize: 20 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            Provedor de narração padrão
          </Typography>
        </Stack>

        <Stack spacing={1.5}>
          {TTS_PROVIDERS.map((provider) => {
            const isActive = currentProvider === provider.id
            const keyConfigured = !provider.needsKey || !!settings?.[provider.keyFlag]
            const isDisabled = saving || (provider.needsKey && !keyConfigured)

            return (
              <Box
                key={provider.id}
                onClick={() => !isDisabled && handleProviderChange(null, provider.id)}
                sx={{
                  p: 2, borderRadius: 2, border: 2, cursor: isDisabled ? "default" : "pointer",
                  borderColor: isActive ? provider.color : "divider",
                  bgcolor: isActive ? alpha(provider.color, 0.04) : "transparent",
                  opacity: isDisabled && !isActive ? 0.5 : 1,
                  transition: "all 0.15s ease",
                  "&:hover": !isDisabled ? {
                    borderColor: alpha(provider.color, 0.5),
                    bgcolor: alpha(provider.color, 0.03),
                  } : {},
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center">
                  <RecordVoiceOverIcon sx={{ color: isActive ? provider.color : "text.secondary", fontSize: 24 }} />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {provider.label}
                      </Typography>
                      {isActive && (
                        <Chip
                          size="small" variant="outlined"
                          icon={<CheckCircleIcon fontSize="small" />}
                          label="selecionado"
                          sx={{ fontWeight: 500, borderColor: provider.color, color: provider.color }}
                        />
                      )}
                      {provider.needsKey && !keyConfigured && (
                        <Chip
                          size="small" variant="outlined" color="warning"
                          label="chave não configurada"
                          sx={{ fontWeight: 500 }}
                        />
                      )}
                      {provider.needsKey && keyConfigured && !isActive && (
                        <Chip
                          size="small" variant="outlined" color="success"
                          label="chave configurada"
                          sx={{ fontWeight: 500 }}
                        />
                      )}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {provider.hint}
                    </Typography>
                  </Box>
                </Stack>
              </Box>
            )
          })}
        </Stack>
      </Box>
    </Stack>
  )
}
