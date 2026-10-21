// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState } from "react"
import {
  Box, Stack, Typography, FormControl, InputLabel, Select, MenuItem,
  RadioGroup, FormControlLabel, Radio, Chip, Alert, TextField, Button,
  InputAdornment, IconButton, Link,
} from "@mui/material"
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined"
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined"
import SaveIcon from "@mui/icons-material/SaveOutlined"
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline"
import GraphicEqIcon from "@mui/icons-material/GraphicEqOutlined"
import BoltIcon from "@mui/icons-material/BoltOutlined"
import StorageIcon from "@mui/icons-material/StorageOutlined"
import useAppStore from "../../store/appStore"

const WHISPER_MODELS = [
  { value: "fast", label: "Rápido (Base)", size: "~150 MB", desc: "Menor uso de memória, ideal para máquinas leves" },
  { value: "balanced", label: "Equilibrado (Small)", size: "~500 MB", desc: "Padrão recomendado — bom equilíbrio de acurácia e velocidade" },
  { value: "accurate", label: "Preciso (Medium)", size: "~1.5 GB", desc: "Alta precisão para vocabulários complexos e sotaques" },
  { value: "best", label: "Máxima Qualidade (Large-v3)", size: "~3 GB", desc: "Qualidade máxima disponível pelo Whisper" },
]

export default function STTSection({ settings, updateSettings }) {
  const showSnackbar = useAppStore((s) => s.showSnackbar)

  const groqKeySet = !!settings?.groq_api_key_set
  const [groqKey, setGroqKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [savingKey, setSavingKey] = useState(false)

  // Current engine selection: if groq key is set, user can select Groq or Local
  const [selectedQuality, setSelectedQuality] = useState(settings?.whisper_quality || "balanced")
  const [savingQuality, setSavingQuality] = useState(false)

  const handleSaveGroqKey = async () => {
    const key = groqKey.trim()
    if (!key) {
      showSnackbar("Cole sua chave de API Groq primeiro", "warning")
      return
    }
    setSavingKey(true)
    try {
      await updateSettings({ groq_api_key: key })
      setGroqKey("")
      showSnackbar("Chave Groq Whisper salva com sucesso", "success")
    } catch {
      // updateSettings handles error snackbar
    } finally {
      setSavingKey(false)
    }
  }

  const handleRemoveGroqKey = async () => {
    setSavingKey(true)
    try {
      await updateSettings({ groq_api_key: "" })
      setGroqKey("")
      showSnackbar("Chave Groq removida", "info")
    } catch {
      // updateSettings handles error snackbar
    } finally {
      setSavingKey(false)
    }
  }

  const handleQualityChange = async (newQuality) => {
    setSelectedQuality(newQuality)
    setSavingQuality(true)
    try {
      await updateSettings({ whisper_quality: newQuality })
      showSnackbar("Qualidade do Whisper atualizada", "success")
    } catch {
      setSelectedQuality(settings?.whisper_quality || "balanced")
    } finally {
      setSavingQuality(false)
    }
  }

  return (
    <Stack spacing={3}>
      <Typography variant="body2" color="text.secondary">
        Configure os motores de reconhecimento e transcrição de fala para geração automática de legendas e cortes inteligentes de vídeo.
      </Typography>

      {/* ── Motor em Nuvem: Groq Whisper (Ultra-Rápido) ── */}
      <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: 2,
            bgcolor: "rgba(245, 80, 54, 0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#F55036",
          }}>
            <BoltIcon />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Groq Whisper Cloud (Ultra-Rápido)
              </Typography>
              {groqKeySet ? (
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  icon={<CheckCircleIcon fontSize="small" />}
                  label="ativo & configurado"
                  sx={{ fontWeight: 500 }}
                />
              ) : (
                <Chip size="small" variant="outlined" label="chave não configurada" />
              )}
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Transcreve vídeos de até 25 MB em poucos segundos usando Whisper Large v3 nos chips LPU da Groq (~10x mais rápido que tempo real).
            </Typography>
          </Box>
        </Stack>

        <Stack spacing={1.5} sx={{ mt: 2 }}>
          <TextField
            type={showKey ? "text" : "password"}
            size="small"
            fullWidth
            value={groqKey}
            onChange={(e) => setGroqKey(e.target.value)}
            placeholder={groqKeySet ? "••••••••••••••••••••••••••••••••" : "gsk_..."}
            helperText={
              <>
                Obtenha uma chave gratuita no{" "}
                <Link href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
                  console.groq.com
                </Link>{" "}
                (cota gratuita generosa para transcrição de áudio).
              </>
            }
            disabled={savingKey}
            autoComplete="off"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowKey((v) => !v)} edge="end" tabIndex={-1}>
                    {showKey ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Stack direction="row" spacing={1.5}>
            <Button
              variant="contained"
              size="small"
              startIcon={<SaveIcon />}
              onClick={handleSaveGroqKey}
              disabled={savingKey || !groqKey.trim()}
            >
              {savingKey ? "Salvando…" : "Salvar Chave Groq"}
            </Button>
            {groqKeySet && (
              <Button
                variant="outlined"
                color="error"
                size="small"
                onClick={handleRemoveGroqKey}
                disabled={savingKey}
              >
                Remover Chave
              </Button>
            )}
          </Stack>
        </Stack>
      </Box>

      {/* ── Motor Local: Faster-Whisper (On-Device) ── */}
      <Box sx={{ p: 2.5, border: 1, borderColor: "divider", borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
          <Box sx={{
            width: 36, height: 36, borderRadius: 2,
            bgcolor: "rgba(13, 159, 110, 0.1)",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#0d9f6e",
          }}>
            <StorageIcon />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                Faster-Whisper (Motor Local / On-Device)
              </Typography>
              <Chip
                size="small"
                color="info"
                variant="outlined"
                label="sempre disponível (fallback)"
                sx={{ fontWeight: 500 }}
              />
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Executa diretamente no servidor/container sem custos de API ou limites de tamanho de arquivo. O modelo é baixado automaticamente na primeira execução.
            </Typography>
          </Box>
        </Stack>

        <Stack spacing={2} sx={{ mt: 2 }}>
          <FormControl fullWidth size="small">
            <InputLabel id="whisper-quality-label">Qualidade / Tamanho do Modelo Local</InputLabel>
            <Select
              labelId="whisper-quality-label"
              value={selectedQuality}
              label="Qualidade / Tamanho do Modelo Local"
              onChange={(e) => handleQualityChange(e.target.value)}
              disabled={savingQuality}
            >
              {WHISPER_MODELS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ width: "100%" }}>
                    <Typography variant="body2">{m.label}</Typography>
                    <Chip size="small" variant="outlined" label={m.size} sx={{ fontSize: "0.7rem", height: 20 }} />
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Typography variant="caption" sx={{ color: "text.secondary", pl: 0.5 }}>
            {WHISPER_MODELS.find((m) => m.value === selectedQuality)?.desc}
          </Typography>
        </Stack>
      </Box>
    </Stack>
  )
}
