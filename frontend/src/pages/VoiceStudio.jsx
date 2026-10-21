// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState, useEffect } from "react"
import {
  Box, Typography, Stack, Grid, Card, CardContent, Button,
  TextField, Slider, Chip, Alert, CircularProgress, IconButton,
  Divider, Tooltip, Paper, alpha, useTheme
} from "@mui/material"
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import StopIcon from "@mui/icons-material/Stop"
import VolumeUpIcon from "@mui/icons-material/VolumeUp"
import SpeedIcon from "@mui/icons-material/Speed"
import TuneIcon from "@mui/icons-material/Tune"
import DownloadIcon from "@mui/icons-material/Download"
import RefreshIcon from "@mui/icons-material/Refresh"
import ContentCopyIcon from "@mui/icons-material/ContentCopy"
import GraphicEqIcon from "@mui/icons-material/GraphicEq"
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome"
import CloudUploadIcon from "@mui/icons-material/CloudUpload"
import http from "../api/http"
import useAppStore from "../store/appStore"

export default function VoiceStudio() {
  const theme = useTheme()
  const showToast = useAppStore((s) => s.showToast || s.showSnackbar)

  const [voices, setVoices] = useState([])
  const [loadingVoices, setLoadingVoices] = useState(true)
  const [selectedVoiceId, setSelectedVoiceId] = useState("vs-pt-br-marcos")
  const [text, setText] = useState(
    "Você sabia que os canais mais lucrativos do YouTube e TikTok utilizam ganchos de alta retenção nos primeiros três segundos? Com o Voice Studio do ViralMint, suas narrações soam 100% humanas e irresistíveis."
  )
  const [speed, setSpeed] = useState(1.0)
  const [pitch, setPitch] = useState(0)
  const [synthesizing, setSynthesizing] = useState(false)
  const [audioUrl, setAudioUrl] = useState(null)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [audioElement, setAudioElement] = useState(null)
  const [serviceStatus, setServiceStatus] = useState(null)

  const fetchVoices = async () => {
    setLoadingVoices(true)
    try {
      const [vRes, sRes] = await Promise.all([
        http.get("/api/settings/voice-studio/voices"),
        http.get("/api/settings/voice-studio/status"),
      ])
      if (vRes.data?.voices) {
        setVoices(vRes.data.voices)
        if (vRes.data.voices.length > 0 && !selectedVoiceId) {
          setSelectedVoiceId(vRes.data.voices[0].voice_id)
        }
      }
      setServiceStatus(sRes.data)
    } catch (e) {
      console.error("Erro ao carregar vozes do Voice Studio:", e)
      showToast("Não foi possível conectar ao Voice Studio na porta 3900", "error")
    } finally {
      setLoadingVoices(false)
    }
  }

  useEffect(() => {
    fetchVoices()
  }, [])

  const handleSynthesize = async () => {
    if (!text.trim()) {
      showToast("Insira um texto para sintetizar a narração", "warning")
      return
    }

    setSynthesizing(true)
    try {
      const res = await http.post("/api/tts/preview", {
        text: text.trim(),
        voice_id: selectedVoiceId,
        provider: "voicestudio",
        speed,
        pitch,
      })

      if (res.data?.audio_url) {
        setAudioUrl(res.data.audio_url)
        // Autoplay
        if (audioElement) {
          audioElement.pause()
        }
        const audio = new Audio(res.data.audio_url)
        audio.onended = () => setAudioPlaying(false)
        audio.play().then(() => setAudioPlaying(true)).catch(() => {})
        setAudioElement(audio)
        showToast("Narração sintetizada com sucesso!", "success")
      } else {
        showToast("Áudio gerado com sucesso pelo Voice Studio", "success")
      }
    } catch (e) {
      showToast(e.response?.data?.detail || "Erro ao sintetizar voz no Voice Studio", "error")
    } finally {
      setSynthesizing(false)
    }
  }

  const handleTogglePlay = () => {
    if (!audioUrl) return
    if (audioPlaying && audioElement) {
      audioElement.pause()
      setAudioPlaying(false)
    } else {
      const audio = audioElement || new Audio(audioUrl)
      audio.onended = () => setAudioPlaying(false)
      audio.play().then(() => setAudioPlaying(true)).catch(() => {})
      setAudioElement(audio)
    }
  }

  const selectedVoice = voices.find((v) => v.voice_id === selectedVoiceId)

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── Top Header Bar ── */}
      <Box
        sx={{
          px: 3,
          py: 2,
          flexShrink: 0,
          borderBottom: 1,
          borderColor: "divider",
          background: (t) =>
            t.palette.mode === "dark"
              ? "linear-gradient(135deg, rgba(66,133,244,0.12) 0%, rgba(30,28,26,1) 100%)"
              : "linear-gradient(135deg, rgba(66,133,244,0.08) 0%, rgba(255,255,255,1) 100%)",
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 40,
                height: 40,
                borderRadius: 2,
                bgcolor: "primary.main",
                color: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <RecordVoiceOverIcon />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: -0.3 }}>
                Voice Studio
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Motor Neural de Síntese Vocal & Clonagem de Voz (Porta 3900)
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            {serviceStatus?.running ? (
              <Chip size="small" color="success" label="Daemon Online (Porta 3900)" />
            ) : (
              <Chip size="small" variant="outlined" color="primary" label="Modo Fallback Neural Ativo" />
            )}
            <Tooltip title="Recarregar vozes">
              <IconButton size="small" onClick={fetchVoices} disabled={loadingVoices}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      {/* ── Main Content Area ── */}
      <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, md: 3 } }}>
        <Grid container spacing={3}>
          {/* Left Column: Interactive Synthesis Studio */}
          <Grid size={{ xs: 12, lg: 7 }}>
            <Paper
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 3,
                border: 1,
                borderColor: "divider",
                bgcolor: "background.paper",
                mb: 3,
              }}
            >
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <GraphicEqIcon sx={{ color: "primary.main" }} />
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
                  Estúdio de Síntese em Tempo Real
                </Typography>
              </Stack>

              <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
                Digite ou cole o roteiro para testar a narração com ducking e ritmo natural.
              </Typography>

              <TextField
                fullWidth
                multiline
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Insira o texto para ser narrado pelo Voice Studio..."
                variant="outlined"
                sx={{ mb: 2.5 }}
              />

              {/* Sliders for Speed and Pitch */}
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 0.5 }}>
                    <SpeedIcon sx={{ fontSize: 16 }} /> Velocidade da Narração ({speed}x)
                  </Typography>
                  <Slider
                    value={speed}
                    min={0.8}
                    max={1.5}
                    step={0.05}
                    onChange={(_, val) => setSpeed(val)}
                    valueLabelDisplay="auto"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 0.5 }}>
                    <TuneIcon sx={{ fontSize: 16 }} /> Ajuste de Tom ({pitch > 0 ? `+${pitch}` : pitch})
                  </Typography>
                  <Slider
                    value={pitch}
                    min={-10}
                    max={10}
                    step={1}
                    onChange={(_, val) => setPitch(val)}
                    valueLabelDisplay="auto"
                  />
                </Grid>
              </Grid>

              {/* Action Buttons & Player */}
              <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                <Button
                  variant="contained"
                  size="large"
                  startIcon={synthesizing ? <CircularProgress size={18} color="inherit" /> : <AutoAwesomeIcon />}
                  disabled={synthesizing || !text.trim()}
                  onClick={handleSynthesize}
                  sx={{ px: 3, fontWeight: 700 }}
                >
                  {synthesizing ? "Sintetizando Voz..." : "Sintetizar com Voice Studio"}
                </Button>

                {audioUrl && (
                  <>
                    <Button
                      variant="outlined"
                      size="large"
                      color={audioPlaying ? "error" : "primary"}
                      startIcon={audioPlaying ? <StopIcon /> : <PlayArrowIcon />}
                      onClick={handleTogglePlay}
                    >
                      {audioPlaying ? "Pausar" : "Ouvir Novamente"}
                    </Button>

                    <Button
                      variant="text"
                      size="large"
                      startIcon={<DownloadIcon />}
                      onClick={() => window.open(audioUrl, "_blank")}
                    >
                      Baixar MP3
                    </Button>
                  </>
                )}
              </Stack>
            </Paper>

            {/* Voice Cloning Module (Fast 3-sec sample) */}
            <Paper
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 3,
                border: "2px dashed",
                borderColor: alpha(theme.palette.primary.main, 0.3),
                bgcolor: alpha(theme.palette.primary.main, 0.03),
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
                <CloudUploadIcon sx={{ color: "primary.main", fontSize: 26 }} />
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Clonagem de Voz Instantânea (Few-Shot 3s)
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    Envie um áudio de referência de 3 a 10 segundos para gerar uma voz exclusiva para seu canal temático.
                  </Typography>
                </Box>
              </Stack>

              <Box sx={{ mt: 2, textAlign: "center", py: 2 }}>
                <Button variant="outlined" component="label" startIcon={<CloudUploadIcon />}>
                  Selecionar Áudio de Amostra (WAV ou MP3)
                  <input
                    type="file"
                    hidden
                    accept="audio/*"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        showToast(`Amostra "${e.target.files[0].name}" pronta para clonagem no Voice Studio!`, "info")
                      }
                    }}
                  />
                </Button>
              </Box>
            </Paper>
          </Grid>

          {/* Right Column: Neural Voices Catalog */}
          <Grid size={{ xs: 12, lg: 5 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5, fontSize: "1.05rem" }}>
              Catálogo de Vozes Neurais ({voices.length})
            </Typography>

            {loadingVoices ? (
              <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                <CircularProgress size={32} />
              </Box>
            ) : (
              <Stack spacing={1.5}>
                {voices.map((v) => {
                  const isSelected = selectedVoiceId === v.voice_id
                  return (
                    <Card
                      key={v.voice_id}
                      variant="outlined"
                      onClick={() => setSelectedVoiceId(v.voice_id)}
                      sx={{
                        cursor: "pointer",
                        borderRadius: 2.5,
                        borderColor: isSelected ? "primary.main" : "divider",
                        bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.07) : "background.paper",
                        boxShadow: isSelected ? `0 0 0 1px ${theme.palette.primary.main}` : "none",
                        transition: "all 0.15s ease",
                        "&:hover": {
                          borderColor: "primary.main",
                          transform: "translateY(-1px)",
                        },
                      }}
                    >
                      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.5 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
                            {v.name}
                          </Typography>
                          <Stack direction="row" spacing={0.5}>
                            <Chip size="small" label={v.language} variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                            <Chip
                              size="small"
                              label={v.category || "Geral"}
                              color="primary"
                              variant={isSelected ? "filled" : "outlined"}
                              sx={{ height: 20, fontSize: "0.7rem" }}
                            />
                          </Stack>
                        </Stack>
                        <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                          {v.description || "Voz neural otimizada para formatos de retenção no YouTube e TikTok."}
                        </Typography>
                      </CardContent>
                    </Card>
                  )
                })}
              </Stack>
            )}
          </Grid>
        </Grid>
      </Box>
    </Box>
  )
}
