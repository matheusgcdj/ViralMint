// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState, useEffect, useRef } from "react"
import {
  Box, Typography, Stack, Grid, Card, CardContent, Button,
  TextField, Slider, Chip, CircularProgress, IconButton,
  Divider, Tooltip, Paper, alpha, useTheme, ToggleButton,
  ToggleButtonGroup, FormControl, FormLabel, RadioGroup,
  FormControlLabel, Radio, MenuItem
} from "@mui/material"
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver"
import PlayArrowIcon from "@mui/icons-material/PlayArrow"
import StopIcon from "@mui/icons-material/Stop"
import VolumeUpIcon from "@mui/icons-material/VolumeUp"
import SpeedIcon from "@mui/icons-material/Speed"
import TuneIcon from "@mui/icons-material/Tune"
import DownloadIcon from "@mui/icons-material/Download"
import RefreshIcon from "@mui/icons-material/Refresh"
import GraphicEqIcon from "@mui/icons-material/GraphicEq"
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome"
import CloudUploadIcon from "@mui/icons-material/CloudUpload"
import MicIcon from "@mui/icons-material/Mic"
import ReplayIcon from "@mui/icons-material/Replay"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import AudiotrackIcon from "@mui/icons-material/Audiotrack"
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline"
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord"
import http from "../api/http"
import useAppStore from "../store/appStore"

export default function VoiceStudio() {
  const theme = useTheme()
  const showToast = useAppStore((s) => s.showToast || s.showSnackbar)

  // Catalog & Synthesis State
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

  // ── Voice Cloning State ──
  const [cloneMode, setCloneMode] = useState("record") // "record" | "upload"
  const [recording, setRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const [recordedBlob, setRecordedBlob] = useState(null)
  const [recordedUrl, setRecordedUrl] = useState(null)
  const [recordingAudioPlaying, setRecordingAudioPlaying] = useState(false)
  const recordAudioElRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const streamRef = useRef(null)
  const timerIntervalRef = useRef(null)
  const audioChunksRef = useRef([])

  // Upload Audio State
  const [uploadedFile, setUploadedFile] = useState(null)
  const [uploadedUrl, setUploadedUrl] = useState(null)
  const [uploadedAudioPlaying, setUploadedAudioPlaying] = useState(false)
  const uploadAudioElRef = useRef(null)

  // Voice Metadata for Cloning
  const [voiceName, setVoiceName] = useState("")
  const [refText, setRefText] = useState("")
  const [voiceCategory, setVoiceCategory] = useState("podcast")
  const [voiceGender, setVoiceGender] = useState("male")
  const [cloning, setCloning] = useState(false)

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
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl)
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
      if (uploadedUrl) URL.revokeObjectURL(uploadedUrl)
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  // ── Recording Actions ──
  const startRecording = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        showToast("Seu navegador não suporta captura direta de microfone", "error")
        return
      }

      resetRecording()
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      audioChunksRef.current = []

      let mimeType = "audio/webm"
      if (window.MediaRecorder?.isTypeSupported("audio/webm;codecs=opus")) {
        mimeType = "audio/webm;codecs=opus"
      } else if (window.MediaRecorder?.isTypeSupported("audio/ogg;codecs=opus")) {
        mimeType = "audio/ogg;codecs=opus"
      } else if (window.MediaRecorder?.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4"
      }

      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = () => {
        const finalBlob = new Blob(audioChunksRef.current, { type: mimeType })
        setRecordedBlob(finalBlob)
        const url = URL.createObjectURL(finalBlob)
        setRecordedUrl(url)

        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }
      }

      recorder.start(200)
      setRecording(true)
      setRecordSeconds(0)

      timerIntervalRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1)
      }, 1000)
    } catch (err) {
      console.error("Erro ao acessar microfone:", err)
      showToast("Acesso ao microfone negado ou não encontrado. Verifique as permissões.", "error")
    }
  }

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    setRecording(false)
  }

  const resetRecording = () => {
    if (recording) {
      stopRecording()
    }
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl)
      setRecordedUrl(null)
    }
    if (recordAudioElRef.current) {
      recordAudioElRef.current.pause()
      recordAudioElRef.current = null
    }
    setRecordedBlob(null)
    setRecordSeconds(0)
    setRecordingAudioPlaying(false)
  }

  const togglePlayRecorded = () => {
    if (!recordedUrl) return
    if (recordingAudioPlaying && recordAudioElRef.current) {
      recordAudioElRef.current.pause()
      setRecordingAudioPlaying(false)
    } else {
      if (recordAudioElRef.current) {
        recordAudioElRef.current.pause()
      }
      const audio = new Audio(recordedUrl)
      recordAudioElRef.current = audio
      audio.onended = () => setRecordingAudioPlaying(false)
      audio.play().then(() => setRecordingAudioPlaying(true)).catch(() => {})
    }
  }

  // ── Upload Actions ──
  const handleFileSelect = (file) => {
    if (!file) return
    if (!file.type.startsWith("audio/") && !file.name.match(/\.(wav|mp3|m4a|ogg|webm|flac|aac)$/i)) {
      showToast("Selecione um arquivo de áudio válido (WAV, MP3, M4A, OGG, WebM)", "warning")
      return
    }

    setUploadedFile(file)
    if (uploadedUrl) {
      URL.revokeObjectURL(uploadedUrl)
    }
    const url = URL.createObjectURL(file)
    setUploadedUrl(url)

    if (!voiceName.trim()) {
      const clean = file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ")
      setVoiceName(clean.charAt(0).toUpperCase() + clean.slice(1))
    }
  }

  const togglePlayUploaded = () => {
    if (!uploadedUrl) return
    if (uploadedAudioPlaying && uploadAudioElRef.current) {
      uploadAudioElRef.current.pause()
      setUploadedAudioPlaying(false)
    } else {
      if (uploadAudioElRef.current) {
        uploadAudioElRef.current.pause()
      }
      const audio = new Audio(uploadedUrl)
      uploadAudioElRef.current = audio
      audio.onended = () => setUploadedAudioPlaying(false)
      audio.play().then(() => setUploadedAudioPlaying(true)).catch(() => {})
    }
  }

  const resetUploaded = () => {
    if (uploadedUrl) {
      URL.revokeObjectURL(uploadedUrl)
      setUploadedUrl(null)
    }
    if (uploadAudioElRef.current) {
      uploadAudioElRef.current.pause()
      uploadAudioElRef.current = null
    }
    setUploadedFile(null)
    setUploadedAudioPlaying(false)
  }

  // ── Voice Cloning Submit ──
  const handleCloneVoice = async () => {
    const isRecord = cloneMode === "record"
    const audioData = isRecord ? recordedBlob : uploadedFile

    if (!audioData) {
      showToast("Grave pelo microfone ou envie um áudio de referência para clonar", "warning")
      return
    }

    if (!voiceName.trim()) {
      showToast("Defina um nome para a voz clonada", "warning")
      return
    }

    setCloning(true)
    try {
      const formData = new FormData()
      const ext = isRecord ? "webm" : uploadedFile.name.split(".").pop() || "wav"
      const safeFilename = `${voiceName.trim().replace(/\s+/g, "_").toLowerCase()}.${ext}`

      formData.append("file", audioData, safeFilename)
      formData.append("voice_name", voiceName.trim())
      if (refText.trim()) {
        formData.append("ref_text", refText.trim())
      }
      formData.append("category", voiceCategory)
      formData.append("gender", voiceGender)
      formData.append(
        "description",
        `Voz clonada via Few-Shot 3s (${isRecord ? "Microfone" : "Arquivo"}) para canais temáticos`
      )

      const res = await http.post("/api/settings/voice-studio/clone", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })

      if (res.data?.ok && res.data?.voice) {
        showToast(res.data.message || `Voz "${res.data.voice.name}" clonada com sucesso!`, "success")
        await fetchVoices()
        setSelectedVoiceId(res.data.voice.voice_id)

        // Clear input states
        resetRecording()
        resetUploaded()
        setVoiceName("")
        setRefText("")
      } else {
        showToast("Voz clonada com sucesso!", "success")
        await fetchVoices()
      }
    } catch (err) {
      console.error("Erro ao clonar voz:", err)
      showToast(err.response?.data?.detail || "Erro ao processar clonagem no Voice Studio", "error")
    } finally {
      setCloning(false)
    }
  }

  // ── Delete Cloned Voice ──
  const handleDeleteVoice = async (voiceId, voiceName, e) => {
    e.stopPropagation()
    if (!window.confirm(`Deseja realmente remover a voz clonada "${voiceName}"?`)) return

    try {
      await http.delete(`/api/settings/voice-studio/voices/${voiceId}`)
      showToast("Voz clonada removida com sucesso", "info")
      await fetchVoices()
      if (selectedVoiceId === voiceId) {
        setSelectedVoiceId("vs-pt-br-marcos")
      }
    } catch (err) {
      showToast("Não foi possível excluir a voz clonada", "error")
    }
  }

  // ── Synthesize Speech ──
  const handleSynthesize = async () => {
    if (!text.trim()) {
      showToast("Insira um texto para sintetizar a narração", "warning")
      return
    }

    setSynthesizing(true)
    try {
      const res = await http.post(
        "/api/tts/preview",
        {
          text: text.trim(),
          voice_id: selectedVoiceId,
          provider: "voicestudio",
          speed,
          pitch,
        },
        { responseType: "blob", timeout: 300000 }
      )

      if (audioUrl) {
        URL.revokeObjectURL(audioUrl)
      }
      const newUrl = URL.createObjectURL(res.data)
      setAudioUrl(newUrl)

      if (audioElement) {
        audioElement.pause()
      }
      const audio = new Audio(newUrl)
      audio.onended = () => setAudioPlaying(false)
      audio.play().then(() => setAudioPlaying(true)).catch(() => {})
      setAudioElement(audio)
      showToast("Narração sintetizada com sucesso!", "success")
    } catch (e) {
      console.error("Erro ao sintetizar voz:", e)
      let msg = "Erro ao sintetizar voz no Voice Studio"
      try {
        const data = e.response?.data
        if (data && typeof data.text === "function") {
          const parsed = JSON.parse(await data.text())
          if (parsed?.detail) msg = parsed.detail
        } else if (data?.detail) {
          msg = data.detail
        } else if (e.code === "ECONNABORTED" || e.message?.includes("timeout")) {
          msg = "A síntese neural excedeu o tempo limite do navegador. Aguarde o processamento ou tente uma frase mais curta."
        } else if (e.message) {
          msg = e.message
        }
      } catch {
        if (e.message) msg = e.message
      }
      showToast(msg, "error")
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

  // Formatting helpers
  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`
  }

  const hasReadyAudio = cloneMode === "record" ? Boolean(recordedBlob) : Boolean(uploadedFile)

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
                Motor Neural de Síntese Vocal & Clonagem Instantânea Few-Shot (Porta 3900)
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            {serviceStatus?.running ? (
              <Chip size="small" color="success" label="Daemon Online (Porta 3900)" />
            ) : (
              <Chip size="small" variant="outlined" color="primary" label="Modo Fallback Neural Ativo" />
            )}
            <Tooltip title="Recarregar vozes e status">
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
          {/* Left Column: Synthesis Studio + Interactive Voice Cloning */}
          <Grid size={{ xs: 12, lg: 7 }}>
            {/* 1. Real-Time Synthesis Card */}
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
                {selectedVoice && (
                  <Chip
                    size="small"
                    variant="outlined"
                    color={selectedVoice.is_cloned ? "secondary" : "primary"}
                    label={`Voz: ${selectedVoice.name}`}
                    sx={{ ml: "auto !important", fontWeight: 600 }}
                  />
                )}
              </Stack>

              <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
                Digite ou cole o roteiro para testar a narração com ducking e ritmo natural.
              </Typography>

              <TextField
                fullWidth
                multiline
                rows={4}
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
                      onClick={() => {
                        const a = document.createElement("a")
                        a.href = audioUrl
                        a.download = `voicestudio_${selectedVoiceId}_${Date.now()}.mp3`
                        a.click()
                      }}
                    >
                      Baixar MP3
                    </Button>
                  </>
                )}
              </Stack>
            </Paper>

            {/* 2. Interactive Voice Cloning Module (Few-Shot 3s) */}
            <Paper
              elevation={0}
              sx={{
                p: 3,
                borderRadius: 3,
                border: 2,
                borderColor: (t) =>
                  t.palette.mode === "dark"
                    ? alpha(theme.palette.secondary.main, 0.4)
                    : alpha(theme.palette.primary.main, 0.3),
                bgcolor: (t) =>
                  t.palette.mode === "dark"
                    ? alpha(theme.palette.secondary.main, 0.04)
                    : alpha(theme.palette.primary.main, 0.02),
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: 2,
                    bgcolor: alpha(theme.palette.secondary.main, 0.15),
                    color: "secondary.main",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    mt: 0.5,
                  }}
                >
                  <AutoAwesomeIcon fontSize="small" />
                </Box>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
                    Clonagem de Voz Instantânea (Few-Shot 3s)
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.2 }}>
                    Crie uma voz neural exclusiva para seu canal temático a partir de apenas 3 a 10 segundos de áudio. Grave diretamente pelo microfone ou envie um áudio pronto.
                  </Typography>
                </Box>
              </Stack>

              {/* Interactive Mode Toggle: Gravar Microfone vs Enviar Áudio */}
              <Box sx={{ mb: 2.5 }}>
                <ToggleButtonGroup
                  value={cloneMode}
                  exclusive
                  onChange={(_, val) => {
                    if (val) setCloneMode(val)
                  }}
                  fullWidth
                  size="small"
                  sx={{
                    bgcolor: "background.paper",
                    borderRadius: 2,
                    "& .MuiToggleButton-root": {
                      py: 1,
                      fontWeight: 600,
                      textTransform: "none",
                      gap: 1,
                    },
                  }}
                >
                  <ToggleButton value="record">
                    <MicIcon fontSize="small" />
                    Gravar com Microfone (Ao Vivo)
                  </ToggleButton>
                  <ToggleButton value="upload">
                    <CloudUploadIcon fontSize="small" />
                    Enviar Áudio Pronto (WAV/MP3)
                  </ToggleButton>
                </ToggleButtonGroup>
              </Box>

              {/* ── Mode 1: Microphone Recording ── */}
              {cloneMode === "record" && (
                <Box
                  sx={{
                    p: 2.5,
                    borderRadius: 2.5,
                    border: 1,
                    borderColor: "divider",
                    bgcolor: "background.paper",
                    textAlign: "center",
                    mb: 2.5,
                  }}
                >
                  {!recording && !recordedBlob && (
                    <Box sx={{ py: 2 }}>
                      <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
                        Fale uma frase com clareza durante 3 a 10 segundos em ambiente silencioso.
                      </Typography>
                      <Button
                        variant="contained"
                        color="primary"
                        size="large"
                        startIcon={<MicIcon />}
                        onClick={startRecording}
                        sx={{ px: 4, py: 1.2, fontWeight: 700, borderRadius: 3 }}
                      >
                        Iniciar Gravação de Áudio
                      </Button>
                      <Typography variant="caption" sx={{ display: "block", color: "text.disabled", mt: 1.5 }}>
                        Exemplo de frase: "Bem-vindos ao nosso canal! Hoje vamos revelar os maiores mistérios da história."
                      </Typography>
                    </Box>
                  )}

                  {recording && (
                    <Box sx={{ py: 2 }}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mb: 2 }}>
                        <FiberManualRecordIcon
                          sx={{
                            color: "error.main",
                            animation: "pulse 1.2s infinite ease-in-out",
                            "@keyframes pulse": {
                              "0%": { opacity: 1, transform: "scale(1)" },
                              "50%": { opacity: 0.3, transform: "scale(1.2)" },
                              "100%": { opacity: 1, transform: "scale(1)" },
                            },
                          }}
                        />
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "error.main" }}>
                          Gravando Áudio... ({formatTimer(recordSeconds)})
                        </Typography>
                      </Stack>

                      <Box sx={{ mb: 2.5 }}>
                        {recordSeconds < 3 ? (
                          <Chip
                            size="small"
                            color="warning"
                            label={`Fale mais um pouco... (mínimo: 3s)`}
                            sx={{ fontWeight: 600 }}
                          />
                        ) : recordSeconds <= 10 ? (
                          <Chip
                            size="small"
                            color="success"
                            label={`Duração perfeita para Few-Shot (${recordSeconds}s)`}
                            sx={{ fontWeight: 600 }}
                          />
                        ) : (
                          <Chip
                            size="small"
                            color="info"
                            label={`Amostra suficiente (${recordSeconds}s)`}
                            sx={{ fontWeight: 600 }}
                          />
                        )}
                      </Box>

                      <Button
                        variant="contained"
                        color="error"
                        size="large"
                        startIcon={<StopIcon />}
                        onClick={stopRecording}
                        sx={{ px: 4, py: 1.2, fontWeight: 700, borderRadius: 3 }}
                      >
                        Concluir e Parar Gravação
                      </Button>
                    </Box>
                  )}

                  {!recording && recordedBlob && (
                    <Box sx={{ py: 1.5 }}>
                      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ mb: 2 }}>
                        <CheckCircleOutlineIcon color="success" />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          Amostra gravada com sucesso ({recordSeconds}s)
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={1.5} justifyContent="center" alignItems="center">
                        <Button
                          variant="outlined"
                          color={recordingAudioPlaying ? "error" : "primary"}
                          startIcon={recordingAudioPlaying ? <StopIcon /> : <PlayArrowIcon />}
                          onClick={togglePlayRecorded}
                        >
                          {recordingAudioPlaying ? "Pausar" : "Ouvir Amostra"}
                        </Button>
                        <Button
                          variant="text"
                          color="inherit"
                          startIcon={<ReplayIcon />}
                          onClick={resetRecording}
                        >
                          Regravar Áudio
                        </Button>
                      </Stack>
                    </Box>
                  )}
                </Box>
              )}

              {/* ── Mode 2: Audio File Upload ── */}
              {cloneMode === "upload" && (
                <Box
                  sx={{
                    p: 2.5,
                    borderRadius: 2.5,
                    border: "2px dashed",
                    borderColor: uploadedFile ? "success.main" : "divider",
                    bgcolor: "background.paper",
                    textAlign: "center",
                    mb: 2.5,
                  }}
                >
                  {!uploadedFile ? (
                    <Box sx={{ py: 2 }}>
                      <CloudUploadIcon sx={{ fontSize: 40, color: "text.secondary", mb: 1 }} />
                      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                        Selecione ou arraste seu áudio de referência
                      </Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
                        Formatos suportados: WAV, MP3, M4A, OGG, WebM (duração recomendada: 3 a 15 segundos)
                      </Typography>
                      <Button variant="outlined" component="label" startIcon={<CloudUploadIcon />}>
                        Escolher Arquivo de Áudio
                        <input
                          type="file"
                          hidden
                          accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              handleFileSelect(e.target.files[0])
                            }
                          }}
                        />
                      </Button>
                    </Box>
                  ) : (
                    <Box sx={{ py: 1.5 }}>
                      <Stack direction="row" spacing={1.5} alignItems="center" justifyContent="center" sx={{ mb: 1.5 }}>
                        <AudiotrackIcon color="primary" />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {uploadedFile.name} ({(uploadedFile.size / 1024).toFixed(0)} KB)
                        </Typography>
                      </Stack>

                      <Stack direction="row" spacing={1.5} justifyContent="center" alignItems="center">
                        <Button
                          variant="outlined"
                          size="small"
                          color={uploadedAudioPlaying ? "error" : "primary"}
                          startIcon={uploadedAudioPlaying ? <StopIcon /> : <PlayArrowIcon />}
                          onClick={togglePlayUploaded}
                        >
                          {uploadedAudioPlaying ? "Pausar" : "Ouvir Áudio"}
                        </Button>
                        <Button
                          variant="text"
                          size="small"
                          color="inherit"
                          onClick={resetUploaded}
                        >
                          Trocar Arquivo
                        </Button>
                      </Stack>
                    </Box>
                  )}
                </Box>
              )}

              {/* ── Voice Metadata Form (shown when audio sample is ready) ── */}
              {hasReadyAudio && (
                <Box sx={{ pt: 1, borderTop: 1, borderColor: "divider" }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1.5 }}>
                    Identificação da Nova Voz
                  </Typography>

                  <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Nome da Voz Clonada"
                        placeholder="Ex: Minha Voz Principal"
                        value={voiceName}
                        onChange={(e) => setVoiceName(e.target.value)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12 }}>
                      <TextField
                        fullWidth
                        size="small"
                        label="Texto falado na amostra (opcional)"
                        placeholder="Deixe em branco para transcrever automaticamente com IA, ou digite o que foi falado"
                        value={refText}
                        onChange={(e) => setRefText(e.target.value)}
                        helperText="A transcrição do áudio de referência calibra a fonética da clonagem zero-shot."
                      />
                    </Grid>
                    <Grid size={{ xs: 12, sm: 3 }}>
                      <TextField
                        fullWidth
                        size="small"
                        select
                        label="Nicho / Categoria"
                        value={voiceCategory}
                        onChange={(e) => setVoiceCategory(e.target.value)}
                      >
                        <MenuItem value="podcast">Cortes & Podcast</MenuItem>
                        <MenuItem value="curiosity">Curiosidades</MenuItem>
                        <MenuItem value="horror_mystery">Terror & Mistério</MenuItem>
                        <MenuItem value="finance">Finanças & Cripto</MenuItem>
                        <MenuItem value="productivity">Produtividade</MenuItem>
                        <MenuItem value="humor_memes">Humor & Memes</MenuItem>
                        <MenuItem value="cloned">Geral / Clonada</MenuItem>
                      </TextField>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 3 }}>
                      <TextField
                        fullWidth
                        size="small"
                        select
                        label="Gênero Vocal"
                        value={voiceGender}
                        onChange={(e) => setVoiceGender(e.target.value)}
                      >
                        <MenuItem value="male">Masculino</MenuItem>
                        <MenuItem value="female">Feminino</MenuItem>
                        <MenuItem value="neutral">Neutro</MenuItem>
                      </TextField>
                    </Grid>
                  </Grid>

                  <Button
                    fullWidth
                    variant="contained"
                    color="secondary"
                    size="large"
                    startIcon={cloning ? <CircularProgress size={18} color="inherit" /> : <AutoAwesomeIcon />}
                    disabled={cloning || !voiceName.trim()}
                    onClick={handleCloneVoice}
                    sx={{ py: 1.2, fontWeight: 700, borderRadius: 2 }}
                  >
                    {cloning ? "Clonando Voz no Voice Studio (Few-Shot)..." : "Clonar e Salvar Voz no Catálogo"}
                  </Button>
                </Box>
              )}
            </Paper>
          </Grid>

          {/* Right Column: Neural Voices Catalog */}
          <Grid size={{ xs: 12, lg: 5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
                Catálogo de Vozes Neurais ({voices.length})
              </Typography>
              <Chip size="small" variant="outlined" label="Otimizadas para Retenção" />
            </Stack>

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
                        borderColor: isSelected
                          ? v.is_cloned ? "secondary.main" : "primary.main"
                          : "divider",
                        bgcolor: isSelected
                          ? alpha(v.is_cloned ? theme.palette.secondary.main : theme.palette.primary.main, 0.08)
                          : "background.paper",
                        boxShadow: isSelected
                          ? `0 0 0 1px ${v.is_cloned ? theme.palette.secondary.main : theme.palette.primary.main}`
                          : "none",
                        transition: "all 0.15s ease",
                        "&:hover": {
                          borderColor: v.is_cloned ? "secondary.main" : "primary.main",
                          transform: "translateY(-1px)",
                        },
                      }}
                    >
                      <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 0.5 }}>
                          <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
                              {v.name}
                            </Typography>
                            {v.is_cloned && (
                              <Chip
                                size="small"
                                color="secondary"
                                icon={<AutoAwesomeIcon sx={{ fontSize: "13px !important" }} />}
                                label="Clonada"
                                sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700 }}
                              />
                            )}
                          </Stack>

                          <Stack direction="row" spacing={0.5} alignItems="center">
                            <Chip size="small" label={v.language} variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
                            <Chip
                              size="small"
                              label={v.category || "Geral"}
                              color={v.is_cloned ? "secondary" : "primary"}
                              variant={isSelected ? "filled" : "outlined"}
                              sx={{ height: 20, fontSize: "0.7rem" }}
                            />
                            {v.is_cloned && (
                              <Tooltip title="Excluir voz clonada">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={(e) => handleDeleteVoice(v.voice_id, v.name, e)}
                                  sx={{ p: 0.5, ml: 0.5 }}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
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
