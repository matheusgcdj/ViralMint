// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  Box, Typography, Stack, Grid, Card, CardContent, Button,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  Stepper, Step, StepLabel, TextField, FormControlLabel,
  Switch, Checkbox, FormControl, InputLabel, Select, MenuItem,
  Alert, CircularProgress, IconButton, Divider, Tooltip,
  Paper, Avatar, alpha, useTheme
} from "@mui/material"
import SensorsIcon from "@mui/icons-material/Sensors"
import AddIcon from "@mui/icons-material/Add"
import YouTubeIcon from "@mui/icons-material/YouTube"
import InstagramIcon from "@mui/icons-material/Instagram"
import MusicNoteIcon from "@mui/icons-material/MusicNote"
import PodcastsIcon from "@mui/icons-material/Podcasts"
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline"
import ScheduleIcon from "@mui/icons-material/Schedule"
import SettingsIcon from "@mui/icons-material/Settings"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import RefreshIcon from "@mui/icons-material/Refresh"
import SendIcon from "@mui/icons-material/Send"
import http from "../api/http"
import useAppStore from "../store/appStore"

const NICHE_ICONS = {
  podcast_cuts: "🎙️",
  curiosity: "🧠",
  finance_crypto: "📈",
  horror_mystery: "👻",
  productivity: "⚡",
  humor_memes: "😂",
}

export default function ChannelProfiles() {
  const theme = useTheme()
  const navigate = useNavigate()
  const showToast = useAppStore((s) => s.showToast || s.showSnackbar)

  const [profiles, setProfiles] = useState([])
  const [presets, setPresets] = useState({})
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)

  // Creation Wizard Modal State
  const [openWizard, setOpenWizard] = useState(false)
  const [activeStep, setActiveStep] = useState(0)
  const [creating, setCreating] = useState(false)

  // Wizard Form Fields
  const [selectedNiche, setSelectedNiche] = useState("podcast_cuts")
  const [selectedAccountIds, setSelectedAccountIds] = useState([])
  const [profileName, setProfileName] = useState("")
  const [voiceProvider, setVoiceProvider] = useState("voicestudio")
  const [captionStyle, setCaptionStyle] = useState("mrbeast")
  const [autoPublish, setAutoPublish] = useState(false)

  const steps = ["Escolha do Nicho", "Vincular Redes Sociais", "Configuração & Ativação"]

  const fetchData = async () => {
    setLoading(true)
    try {
      const [profRes, presRes, accRes] = await Promise.all([
        http.get("/api/channel-profiles"),
        http.get("/api/channel-profiles/presets"),
        http.get("/api/channel-profiles/accounts"),
      ])
      setProfiles(profRes.data?.profiles || [])
      setPresets(presRes.data?.niches || {})
      setAccounts(accRes.data?.accounts || [])
    } catch (e) {
      console.error("Erro ao carregar perfis de canais:", e)
      showToast("Falha ao carregar canais temáticos", "error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleOpenWizard = () => {
    setActiveStep(0)
    setSelectedNiche("podcast_cuts")
    setSelectedAccountIds([])
    setProfileName("")
    setVoiceProvider("voicestudio")
    setCaptionStyle("mrbeast")
    setAutoPublish(false)
    setOpenWizard(true)
  }

  const handleCloseWizard = () => {
    if (!creating) {
      setOpenWizard(false)
    }
  }

  const handleSelectNiche = (nicheKey) => {
    setSelectedNiche(nicheKey)
    const preset = presets[nicheKey]
    if (preset) {
      setProfileName(preset.title || "")
      setCaptionStyle(preset.caption_style || "mrbeast")
      setVoiceProvider(preset.voice_provider || "voicestudio")
    }
  }

  const handleToggleAccount = (accId) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accId) ? prev.filter((id) => id !== accId) : [...prev, accId]
    )
  }

  const handleNextStep = () => {
    if (activeStep === 0) {
      if (!selectedNiche) {
        showToast("Selecione um nicho temático para continuar", "warning")
        return
      }
      setActiveStep(1)
    } else if (activeStep === 1) {
      // PRE-FLIGHT GATE: len(selected_accounts) >= 1
      if (selectedAccountIds.length < 1) {
        showToast("Obrigatório vincular ao menos 1 conta social antes de avançar", "error")
        return
      }
      setActiveStep(2)
    } else if (activeStep === 2) {
      handleCreateProfile()
    }
  }

  const handleBackStep = () => {
    setActiveStep((prev) => Math.max(0, prev - 1))
  }

  const handleCreateProfile = async () => {
    if (!profileName.trim()) {
      showToast("Informe o nome do canal temático", "warning")
      return
    }

    setCreating(true)
    try {
      const payload = {
        name: profileName.trim(),
        niche: selectedNiche,
        is_active: true,
        voice_provider: voiceProvider,
        caption_style: captionStyle,
        auto_publish: autoPublish,
        account_ids: selectedAccountIds,
      }
      await http.post("/api/channel-profiles", payload)
      showToast("Canal temático criado e ativado com sucesso!", "success")
      setOpenWizard(false)
      fetchData()
    } catch (e) {
      showToast(e.response?.data?.detail || "Erro ao criar canal temático", "error")
    } finally {
      setCreating(false)
    }
  }

  const handleDeleteProfile = async (id, name) => {
    if (!window.confirm(`Deseja realmente remover o canal temático "${name}"?`)) return
    try {
      await http.delete(`/api/channel-profiles/${id}`)
      showToast("Canal temático removido", "info")
      fetchData()
    } catch (e) {
      showToast("Falha ao remover canal", "error")
    }
  }

  const handleToggleActive = async (profile) => {
    try {
      await http.put(`/api/channel-profiles/${profile.id}`, {
        is_active: !profile.is_active,
      })
      showToast(
        profile.is_active ? `Canal "${profile.name}" pausado` : `Canal "${profile.name}" ativado`,
        "success"
      )
      fetchData()
    } catch (e) {
      showToast("Erro ao alternar status do canal", "error")
    }
  }

  const renderPlatformIcon = (platform) => {
    switch (platform.toLowerCase()) {
      case "youtube":
        return <YouTubeIcon sx={{ color: "#FF0000", fontSize: 18 }} />
      case "tiktok":
        return <MusicNoteIcon sx={{ color: "#00f2fe", fontSize: 18 }} />
      case "instagram":
        return <InstagramIcon sx={{ color: "#E1306C", fontSize: 18 }} />
      case "kwai":
        return <PodcastsIcon sx={{ color: "#FF7700", fontSize: 18 }} />
      default:
        return <SensorsIcon sx={{ fontSize: 18 }} />
    }
  }

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
              ? "linear-gradient(135deg, rgba(13,159,110,0.12) 0%, rgba(30,28,26,1) 100%)"
              : "linear-gradient(135deg, rgba(13,159,110,0.08) 0%, rgba(255,255,255,1) 100%)",
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
              <SensorsIcon />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: -0.3 }}>
                Canais Temáticos
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Automação autônoma multi-nicho para YouTube Shorts, TikTok, Instagram Reels e Kwai
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenWizard}
              sx={{ fontWeight: 700 }}
            >
              Novo Canal Temático
            </Button>
            <Tooltip title="Recarregar canais">
              <IconButton size="small" onClick={fetchData} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      {/* ── Main Channels Grid ── */}
      <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, md: 3 } }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
            <CircularProgress size={36} />
          </Box>
        ) : profiles.length === 0 ? (
          <Paper
            elevation={0}
            sx={{
              p: 6,
              textAlign: "center",
              borderRadius: 3,
              border: "2px dashed",
              borderColor: "divider",
              maxWidth: 640,
              mx: "auto",
              mt: 4,
            }}
          >
            <Typography variant="h1" sx={{ fontSize: 56, mb: 1.5 }}>
              🚀
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1 }}>
              Nenhum canal temático configurado
            </Typography>
            <Typography variant="body2" sx={{ color: "text.secondary", mb: 3 }}>
              Crie seu primeiro canal temático em 3 passos simples: escolha um nicho viral (Cortes, Curiosidades, Finanças), vincule suas contas sociais e comece a gerar conteúdo automaticamente.
            </Typography>
            <Button
              variant="contained"
              size="large"
              startIcon={<AddIcon />}
              onClick={handleOpenWizard}
              sx={{ fontWeight: 700, px: 3 }}
            >
              Configurar Primeiro Canal
            </Button>
          </Paper>
        ) : (
          <Grid container spacing={2.5}>
            {profiles.map((p) => {
              const nicheInfo = presets[p.niche] || {}
              const icon = NICHE_ICONS[p.niche] || "🎬"

              return (
                <Grid key={p.id} size={{ xs: 12, md: 6, xl: 4 }}>
                  <Card
                    variant="outlined"
                    sx={{
                      borderRadius: 3,
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      transition: "all 0.2s ease",
                      "&:hover": {
                        borderColor: "primary.main",
                        boxShadow: (theme) => `0 4px 20px ${alpha(theme.palette.primary.main, 0.12)}`,
                      },
                    }}
                  >
                    <CardContent sx={{ p: 2.5, flex: 1 }}>
                      {/* Card Header */}
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1.5 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Typography variant="h4" sx={{ fontSize: 32, lineHeight: 1 }}>
                            {icon}
                          </Typography>
                          <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1.05rem" }}>
                              {p.name}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              Nicho: {nicheInfo.title || p.niche}
                            </Typography>
                          </Box>
                        </Stack>

                        <Chip
                          size="small"
                          label={p.is_active ? "Ativo" : "Pausado"}
                          color={p.is_active ? "success" : "default"}
                          variant={p.is_active ? "filled" : "outlined"}
                          onClick={() => handleToggleActive(p)}
                          sx={{ cursor: "pointer", fontWeight: 600, height: 22 }}
                        />
                      </Stack>

                      <Divider sx={{ my: 1.5 }} />

                      {/* Linked Accounts */}
                      <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", display: "block", mb: 0.75 }}>
                        Redes Vinculadas ({p.accounts?.length || 0}):
                      </Typography>
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" sx={{ gap: 0.5, mb: 2 }}>
                        {p.accounts && p.accounts.length > 0 ? (
                          p.accounts.map((acc) => (
                            <Chip
                              key={acc.id}
                              size="small"
                              icon={renderPlatformIcon(acc.platform)}
                              label={acc.account_name || acc.platform}
                              variant="outlined"
                              sx={{ height: 26, fontSize: "0.75rem" }}
                            />
                          ))
                        ) : (
                          <Typography variant="caption" sx={{ color: "error.main" }}>
                            Nenhuma conta vinculada
                          </Typography>
                        )}
                      </Stack>

                      {/* Technical Specs */}
                      <Grid container spacing={1} sx={{ bgcolor: "action.hover", p: 1.25, borderRadius: 2, mb: 2 }}>
                        <Grid size={{ xs: 6 }}>
                          <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                            Voz Neural:
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                            {p.voice_provider === "voicestudio" ? "Voice Studio (3900)" : p.voice_provider}
                          </Typography>
                        </Grid>
                        <Grid size={{ xs: 6 }}>
                          <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                            Estilo Legenda:
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: "0.82rem" }}>
                            {p.caption_style}
                          </Typography>
                        </Grid>
                      </Grid>

                      {/* Stagger Schedule */}
                      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                        <ScheduleIcon sx={{ fontSize: 16, color: "text.secondary" }} />
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          Auto-Publicação: <strong>{p.auto_publish ? "Ativada" : "Manual"}</strong>
                        </Typography>
                      </Stack>
                    </CardContent>

                    <Divider />

                    {/* Card Actions */}
                    <Box sx={{ p: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <Stack direction="row" spacing={1}>
                        <Button
                          size="small"
                          variant="contained"
                          color="primary"
                          startIcon={<PlayCircleOutlineIcon />}
                          onClick={() => navigate("/stock")}
                        >
                          Gerar Vídeo
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={<SendIcon />}
                          onClick={() => navigate("/queue")}
                        >
                          Fila
                        </Button>
                      </Stack>

                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDeleteProfile(p.id, p.name)}
                        sx={{ opacity: 0.7, "&:hover": { opacity: 1 } }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Card>
                </Grid>
              )
            })}
          </Grid>
        )}
      </Box>

      {/* ── 3-STEP CREATION WIZARD MODAL ── */}
      <Dialog open={openWizard} onClose={handleCloseWizard} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Configurar Novo Canal Temático
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            Siga as 3 etapas para criar um canal autônomo com esteira de publicação automática
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 3 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {/* ── ETAPA 1: ESCOLHA DO NICHO ── */}
          {activeStep === 0 && (
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                1. Selecione o Nicho de Conteúdo Viral:
              </Typography>
              <Grid container spacing={2}>
                {Object.entries(presets).map(([key, p]) => {
                  const isSelected = selectedNiche === key
                  const icon = NICHE_ICONS[key] || "🎬"
                  return (
                    <Grid key={key} size={{ xs: 12, sm: 6 }}>
                      <Paper
                        elevation={0}
                        onClick={() => handleSelectNiche(key)}
                        sx={{
                          p: 2,
                          borderRadius: 2.5,
                          border: 2,
                          borderColor: isSelected ? "primary.main" : "divider",
                          bgcolor: isSelected ? alpha(theme.palette.primary.main, 0.06) : "background.paper",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                          "&:hover": {
                            borderColor: "primary.main",
                          },
                        }}
                      >
                        <Stack direction="row" spacing={1.5} alignItems="flex-start">
                          <Typography variant="h4" sx={{ fontSize: 28 }}>
                            {icon}
                          </Typography>
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 700, fontSize: "0.95rem" }}>
                              {p.title}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
                              {p.description}
                            </Typography>
                            <Stack direction="row" spacing={0.5}>
                              <Chip size="small" label={`Legenda: ${p.caption_style}`} sx={{ height: 20, fontSize: "0.68rem" }} />
                              <Chip size="small" color="primary" variant="outlined" label="Ganchos Prontos" sx={{ height: 20, fontSize: "0.68rem" }} />
                            </Stack>
                          </Box>
                        </Stack>
                      </Paper>
                    </Grid>
                  )
                })}
              </Grid>
            </Box>
          )}

          {/* ── ETAPA 2: VINCULAR CONTAS SOCIAIS (PRE-FLIGHT GATE) ── */}
          {activeStep === 1 && (
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
                2. Vincule as Contas das Redes Sociais:
              </Typography>
              <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
                O canal precisa de ao menos uma conta conectada para despachar os vídeos gerados.
              </Typography>

              {accounts.length === 0 ? (
                <Alert severity="warning" sx={{ mb: 2 }} action={
                  <Button color="inherit" size="small" onClick={() => navigate("/settings")}>
                    Ir para Conexões
                  </Button>
                }>
                  Nenhuma conta do YouTube, TikTok ou Instagram encontrada. Conecte suas contas em Configurações &gt; Redes Sociais.
                </Alert>
              ) : (
                <Stack spacing={1.5}>
                  {accounts.map((acc) => {
                    const isChecked = selectedAccountIds.includes(acc.id)
                    return (
                      <Paper
                        key={acc.id}
                        elevation={0}
                        onClick={() => handleToggleAccount(acc.id)}
                        sx={{
                          p: 1.5,
                          borderRadius: 2,
                          border: 1,
                          borderColor: isChecked ? "primary.main" : "divider",
                          bgcolor: isChecked ? alpha(theme.palette.primary.main, 0.05) : "background.paper",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Checkbox checked={isChecked} />
                          {renderPlatformIcon(acc.platform)}
                          <Box>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                              {acc.account_name || acc.platform}
                            </Typography>
                            <Typography variant="caption" sx={{ color: "text.secondary" }}>
                              Plataforma: {acc.platform.toUpperCase()}
                            </Typography>
                          </Box>
                        </Stack>
                        <Chip size="small" color={isChecked ? "primary" : "default"} label={isChecked ? "Vinculada" : "Selecionar"} />
                      </Paper>
                    )
                  })}
                </Stack>
              )}
            </Box>
          )}

          {/* ── ETAPA 3: CONFIGURAÇÃO & ATIVAÇÃO ── */}
          {activeStep === 2 && (
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>
                3. Personalização Final & Estratégia de Publicação:
              </Typography>

              <Stack spacing={2.5}>
                <TextField
                  fullWidth
                  label="Nome do Canal Temático"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Ex: Curiosidades da História, Cortes de Riqueza"
                  required
                />

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth>
                      <InputLabel>Motor de Voz Neural</InputLabel>
                      <Select
                        value={voiceProvider}
                        label="Motor de Voz Neural"
                        onChange={(e) => setVoiceProvider(e.target.value)}
                      >
                        <MenuItem value="voicestudio">Voice Studio (Porta 3900)</MenuItem>
                        <MenuItem value="elevenlabs">ElevenLabs</MenuItem>
                        <MenuItem value="google_tts">Google TTS (WaveNet & Neural2)</MenuItem>
                        <MenuItem value="edge_tts">Edge TTS (Gratuito)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControl fullWidth>
                      <InputLabel>Estilo de Legenda Viral</InputLabel>
                      <Select
                        value={captionStyle}
                        label="Estilo de Legenda Viral"
                        onChange={(e) => setCaptionStyle(e.target.value)}
                      >
                        <MenuItem value="mrbeast">MrBeast (Amarelo / Pop-Scale)</MenuItem>
                        <MenuItem value="hormozi">Alex Hormozi (Bold / Caixas)</MenuItem>
                        <MenuItem value="minimal">Minimalista Elegante</MenuItem>
                        <MenuItem value="neon">Neon Cyberpunk</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>

                <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: 1, borderColor: "divider", bgcolor: "action.hover" }}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={autoPublish}
                        onChange={(e) => setAutoPublish(e.target.checked)}
                        color="primary"
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          Ativar Publicação Automática Anti-Canibalização
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          Vídeos renderizados para este canal entram automaticamente na fila com escalonamento temporal (TikTok +0m, Shorts +120m, Reels +240m, Kwai +360m).
                        </Typography>
                      </Box>
                    }
                  />
                </Paper>
              </Stack>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={handleCloseWizard} disabled={creating}>
            Cancelar
          </Button>
          {activeStep > 0 && (
            <Button onClick={handleBackStep} disabled={creating}>
              Voltar
            </Button>
          )}
          <Button
            variant="contained"
            onClick={handleNextStep}
            disabled={creating}
            sx={{ fontWeight: 700 }}
          >
            {activeStep === steps.length - 1 ? (creating ? "Criando Canal..." : "Concluir e Ativar Canal") : "Avançar"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
