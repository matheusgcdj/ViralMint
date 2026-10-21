// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState, useEffect } from "react"
import {
  Box, Stack, Typography, FormControl, InputLabel, Select, MenuItem,
  RadioGroup, FormControlLabel, Radio, Chip, TextField, Button,
  InputAdornment, IconButton, Link, Paper,
} from "@mui/material"
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined"
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined"
import SaveIcon from "@mui/icons-material/SaveOutlined"
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline"
import BoltIcon from "@mui/icons-material/BoltOutlined"
import StorageIcon from "@mui/icons-material/StorageOutlined"
import SettingsSuggestIcon from "@mui/icons-material/SettingsSuggestOutlined"
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

  const activeProvider = settings?.stt_provider || (groqKeySet ? "groq" : "local")
  const [savingProvider, setSavingProvider] = useState(false)

  const [selectedQuality, setSelectedQuality] = useState(settings?.whisper_quality || "balanced")
  const [savingQuality, setSavingQuality] = useState(false)

  useEffect(() => {
    if (settings?.whisper_quality) {
      setSelectedQuality(settings.whisper_quality)
    }
  }, [settings?.whisper_quality])

  const handleProviderChange = async (provider) => {
    setSavingProvider(true)
    try {
      await updateSettings({ stt_provider: provider })
      showSnackbar(`Motor de transcrição definido para ${provider === "groq" ? "Groq Cloud" : "Local Faster-Whisper"}`, "success")
    } catch {
      // updateSettings handles error snackbar
    } finally {
      setSavingProvider(false)
    }
  }

  const handleSaveGroqKey = async () => {
    const key = groqKey.trim()
    if (!key) {
      showSnackbar("Cole sua chave de API Groq primeiro", "warning")
      return
    }
    setSavingKey(true)
    try {
      await updateSettings({ groq_api_key: key, stt_provider: "groq" })
      setGroqKey("")
      showSnackbar("Chave Groq Whisper salva e ativada como motor principal", "success")
    } catch {
      // updateSettings handles error snackbar
    } finally {
      setSavingKey(false)
    }
  }

  const handleRemoveGroqKey = async () => {
    setSavingKey(true)
    try {
      await updateSettings({ groq_api_key: "", stt_provider: "local" })
      setGroqKey("")
      showSnackbar("Chave Groq removida — motor alterado para Local", "info")
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
        Configure os motores de reconhecimento e transcrição de fala para geração automática de legendas e cortes inteligentes no Estúdio de Cortes e demais ferramentas.
      </Typography>

      {/* ── Seletor de Motor Principal Ativo ── */}
      <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
        <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2 }}>
          <SettingsSuggestIcon color="primary" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              Motor de Transcrição Ativo (Padrão do App)
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Define qual motor é utilizado por padrão no Estúdio de Cortes (Cortes Automáticos), sugestões de IA e ferramentas de legenda.
            </Typography>
          </Box>
        </Stack>

        <RadioGroup
          value={activeProvider}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          <Box sx={{
            border: 1,
            borderColor: activeProvider === "groq" ? "primary.main" : "divider",
            bgcolor: activeProvider === "groq" ? "action.selected" : "transparent",
            borderRadius: 2,
            p: 1.5,
            mb: 1.5,
            transition: "all 0.15s ease",
          }}>
            <FormControlLabel
              value="groq"
              control={<Radio size="small" disabled={savingProvider} />}
              label={
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      ⚡ Groq Whisper Cloud (Ultra-Rápido ~5s)
                    </Typography>
                    {groqKeySet ? (
                      <Chip size="small" color="success" variant="outlined" label="Pronto para uso" sx={{ height: 20, fontSize: "0.68rem" }} />
                    ) : (
                      <Chip size="small" color="warning" variant="outlined" label="Requer chave abaixo" sx={{ height: 20, fontSize: "0.68rem" }} />
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                    Executa em hardware LPU na nuvem Groq com latência quase instantânea. Caso o arquivo exceda 25 MB ou a conexão falhe, o sistema faz fallback automático para o motor local.
                  </Typography>
                </Box>
              }
              sx={{ m: 0, alignItems: "flex-start", width: "100%" }}
            />
          </Box>

          <Box sx={{
            border: 1,
            borderColor: activeProvider === "local" ? "primary.main" : "divider",
            bgcolor: activeProvider === "local" ? "action.selected" : "transparent",
            borderRadius: 2,
            p: 1.5,
            transition: "all 0.15s ease",
          }}>
            <FormControlLabel
              value="local"
              control={<Radio size="small" disabled={savingProvider} />}
              label={
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      🖥️ Faster-Whisper Local (On-Device)
                    </Typography>
                    <Chip size="small" color="info" variant="outlined" label="Offline / Sem limites" sx={{ height: 20, fontSize: "0.68rem" }} />
                  </Stack>
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }}>
                    Processa no servidor/CPU local sem enviar áudio para a nuvem. Não há limites de tamanho de arquivo, porém a transcrição de vídeos longos é mais lenta.
                  </Typography>
                </Box>
              }
              sx={{ m: 0, alignItems: "flex-start", width: "100%" }}
            />
          </Box>
        </RadioGroup>
      </Paper>

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
                Credenciais Groq Cloud API
              </Typography>
              {groqKeySet ? (
                <Chip
                  size="small"
                  color="success"
                  variant="outlined"
                  icon={<CheckCircleIcon fontSize="small" />}
                  label="chave salva & ativa"
                  sx={{ fontWeight: 500 }}
                />
              ) : (
                <Chip size="small" variant="outlined" label="chave não configurada" />
              )}
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Utiliza modelos Whisper Large v3 e Whisper Large v3 Turbo na nuvem LPU da Groq (~10x mais rápido que tempo real).
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
                Obtenha sua chave gratuita no{" "}
                <Link href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
                  console.groq.com
                </Link>{" "}
                (cota gratuita generosa e renovada diariamente).
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
                Faster-Whisper (Modelo Local / Fallback)
              </Typography>
              <Chip
                size="small"
                color="info"
                variant="outlined"
                label="sempre disponível"
                sx={{ fontWeight: 500 }}
              />
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Executa diretamente no servidor/container sem custos de API ou limites de arquivo.
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
