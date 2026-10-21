// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import {
  Box, Typography, Stack, Grid, Card, CardContent, Button,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem,
  Alert, CircularProgress, IconButton, Divider, Tooltip,
  Paper, Avatar, Badge, alpha, useTheme
} from "@mui/material"
import ScheduleSendIcon from "@mui/icons-material/ScheduleSend"
import YouTubeIcon from "@mui/icons-material/YouTube"
import InstagramIcon from "@mui/icons-material/Instagram"
import MusicNoteIcon from "@mui/icons-material/MusicNote"
import PodcastsIcon from "@mui/icons-material/Podcasts"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline"
import RefreshIcon from "@mui/icons-material/Refresh"
import AddIcon from "@mui/icons-material/Add"
import AccessTimeIcon from "@mui/icons-material/AccessTime"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline"
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty"
import BoltIcon from "@mui/icons-material/Bolt"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import http from "../api/http"
import useAppStore from "../store/appStore"

const PLATFORM_COLORS = {
  tiktok: "#00f2fe",
  youtube: "#FF0000",
  instagram: "#E1306C",
  kwai: "#FF7700",
}

export default function PublishQueue() {
  const theme = useTheme()
  const navigate = useNavigate()
  const showToast = useAppStore((s) => s.showToast || s.showSnackbar)

  const [queueItems, setQueueItems] = useState([])
  const [channels, setChannels] = useState([])
  const [libraryVideos, setLibraryVideos] = useState([])
  const [loading, setLoading] = useState(true)

  // Schedule Modal
  const [openModal, setOpenModal] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  const [selectedVideoId, setSelectedVideoId] = useState("")
  const [selectedChannelId, setSelectedChannelId] = useState("")
  const [customTitle, setCustomTitle] = useState("")
  const [isEvergreen, setIsEvergreen] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [qRes, cRes, vRes] = await Promise.all([
        http.get("/api/publish-queue"),
        http.get("/api/channel-profiles"),
        http.get("/api/videos?limit=30"),
      ])
      setQueueItems(qRes.data?.items || [])
      setChannels(cRes.data?.profiles || [])
      setLibraryVideos(vRes.data?.videos || vRes.data?.items || [])
    } catch (e) {
      console.error("Erro ao carregar fila de postagem:", e)
      showToast("Falha ao carregar fila de publicação", "error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleOpenScheduleModal = () => {
    setSelectedVideoId(libraryVideos[0]?.id || "")
    setSelectedChannelId(channels[0]?.id || "")
    setCustomTitle("")
    setIsEvergreen(false)
    setOpenModal(true)
  }

  const handleCancelItem = async (id) => {
    if (!window.confirm("Deseja cancelar esta publicação da esteira?")) return
    try {
      await http.delete(`/api/publish-queue/${id}`)
      showToast("Publicação cancelada e removida da fila", "info")
      fetchData()
    } catch (e) {
      showToast("Erro ao cancelar item da fila", "error")
    }
  }

  const handleScheduleSubmit = async () => {
    if (!selectedVideoId) {
      showToast("Selecione um vídeo da biblioteca", "warning")
      return
    }
    if (!selectedChannelId) {
      showToast("Selecione um canal temático", "warning")
      return
    }

    setScheduling(true)
    try {
      const payload = {
        video_id: selectedVideoId,
        channel_profile_id: selectedChannelId,
        custom_title: customTitle.trim() || undefined,
        is_evergreen: isEvergreen,
      }
      const res = await http.post("/api/publish-queue/schedule", payload)
      showToast(res.data?.message || "Publicação agendada com stagger!", "success")
      setOpenModal(false)
      fetchData()
    } catch (e) {
      showToast(e.response?.data?.detail || "Erro ao agendar publicação", "error")
    } finally {
      setScheduling(false)
    }
  }

  // Group items by platform for horizontal multi-lane layout
  const lanes = useMemo(() => {
    const map = {
      tiktok: [],
      youtube: [],
      instagram: [],
      kwai: [],
    }
    queueItems.forEach((item) => {
      const plat = (item.platform || "tiktok").toLowerCase()
      if (map[plat]) {
        map[plat].push(item)
      } else {
        map.tiktok.push(item)
      }
    })
    return map
  }, [queueItems])

  const renderPlatformBadge = (plat) => {
    switch (plat) {
      case "youtube":
        return <Chip size="small" icon={<YouTubeIcon sx={{ color: "#FF0000" }} />} label="Shorts" variant="outlined" />
      case "tiktok":
        return <Chip size="small" icon={<MusicNoteIcon sx={{ color: "#00f2fe" }} />} label="TikTok" variant="outlined" />
      case "instagram":
        return <Chip size="small" icon={<InstagramIcon sx={{ color: "#E1306C" }} />} label="Reels" variant="outlined" />
      case "kwai":
        return <Chip size="small" icon={<PodcastsIcon sx={{ color: "#FF7700" }} />} label="Kwai" variant="outlined" />
      default:
        return <Chip size="small" label={plat} variant="outlined" />
    }
  }

  const renderStatusBadge = (status) => {
    switch (status) {
      case "published":
        return <Chip size="small" color="success" icon={<CheckCircleIcon sx={{ fontSize: 14 }} />} label="Publicado" />
      case "failed":
        return <Chip size="small" color="error" icon={<ErrorOutlineIcon sx={{ fontSize: 14 }} />} label="Falha" />
      case "scheduled":
        return <Chip size="small" color="info" icon={<AccessTimeIcon sx={{ fontSize: 14 }} />} label="Agendado" />
      default:
        return <Chip size="small" color="warning" icon={<HourglassEmptyIcon sx={{ fontSize: 14 }} />} label="Na Esteira" />
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
              ? "linear-gradient(135deg, rgba(201,100,66,0.12) 0%, rgba(30,28,26,1) 100%)"
              : "linear-gradient(135deg, rgba(201,100,66,0.08) 0%, rgba(255,255,255,1) 100%)",
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
              <ScheduleSendIcon />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: -0.3 }}>
                Fila de Postagem & Escalonamento
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary" }}>
                Distribuição anti-canibalização multi-plataforma com prioridade ponderada e decaimento temporal
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={handleOpenScheduleModal}
              sx={{ fontWeight: 700 }}
            >
              Agendar Publicação
            </Button>
            <Tooltip title="Atualizar fila">
              <IconButton size="small" onClick={fetchData} disabled={loading}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      {/* ── Anti-Cannibalization Info Strip ── */}
      <Box sx={{ px: 3, py: 1.25, bgcolor: "action.hover", borderBottom: 1, borderColor: "divider" }}>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary" }}>
            ESTATÉGIA ANTI-CANIBALIZAÇÃO:
          </Typography>
          <Chip size="small" label="1º TikTok (0 min)" sx={{ height: 20, fontSize: "0.7rem", bgcolor: alpha("#00f2fe", 0.15) }} />
          <Typography variant="caption" sx={{ color: "text.disabled" }}>→</Typography>
          <Chip size="small" label="2º Shorts (+120 min)" sx={{ height: 20, fontSize: "0.7rem", bgcolor: alpha("#FF0000", 0.15) }} />
          <Typography variant="caption" sx={{ color: "text.disabled" }}>→</Typography>
          <Chip size="small" label="3º Reels (+240 min)" sx={{ height: 20, fontSize: "0.7rem", bgcolor: alpha("#E1306C", 0.15) }} />
          <Typography variant="caption" sx={{ color: "text.disabled" }}>→</Typography>
          <Chip size="small" label="4º Kwai (+360 min)" sx={{ height: 20, fontSize: "0.7rem", bgcolor: alpha("#FF7700", 0.15) }} />
        </Stack>
      </Box>

      {/* ── 4-LANE HORIZONTAL KANBAN BOARD ── */}
      <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, md: 3 } }}>
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 6 }}>
            <CircularProgress size={36} />
          </Box>
        ) : (
          <Grid container spacing={2.5}>
            {/* Lane 1: TikTok */}
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: (t) => alpha(t.palette.background.paper, 0.6),
                  minHeight: "70vh",
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <MusicNoteIcon sx={{ color: "#00f2fe", fontSize: 20 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      TikTok
                    </Typography>
                  </Stack>
                  <Chip size="small" label={lanes.tiktok.length} sx={{ fontWeight: 700 }} />
                </Stack>

                <Stack spacing={2}>
                  {lanes.tiktok.map((item) => (
                    <QueueCard key={item.id} item={item} onCancel={handleCancelItem} />
                  ))}
                  {lanes.tiktok.length === 0 && (
                    <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "center", display: "block", py: 4 }}>
                      Nenhum vídeo na esteira do TikTok
                    </Typography>
                  )}
                </Stack>
              </Paper>
            </Grid>

            {/* Lane 2: YouTube Shorts */}
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: (t) => alpha(t.palette.background.paper, 0.6),
                  minHeight: "70vh",
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <YouTubeIcon sx={{ color: "#FF0000", fontSize: 20 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      YouTube Shorts
                    </Typography>
                  </Stack>
                  <Chip size="small" label={lanes.youtube.length} sx={{ fontWeight: 700 }} />
                </Stack>

                <Stack spacing={2}>
                  {lanes.youtube.map((item) => (
                    <QueueCard key={item.id} item={item} onCancel={handleCancelItem} />
                  ))}
                  {lanes.youtube.length === 0 && (
                    <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "center", display: "block", py: 4 }}>
                      Nenhum vídeo na esteira do Shorts
                    </Typography>
                  )}
                </Stack>
              </Paper>
            </Grid>

            {/* Lane 3: Instagram Reels */}
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: (t) => alpha(t.palette.background.paper, 0.6),
                  minHeight: "70vh",
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <InstagramIcon sx={{ color: "#E1306C", fontSize: 20 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Instagram Reels
                    </Typography>
                  </Stack>
                  <Chip size="small" label={lanes.instagram.length} sx={{ fontWeight: 700 }} />
                </Stack>

                <Stack spacing={2}>
                  {lanes.instagram.map((item) => (
                    <QueueCard key={item.id} item={item} onCancel={handleCancelItem} />
                  ))}
                  {lanes.instagram.length === 0 && (
                    <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "center", display: "block", py: 4 }}>
                      Nenhum vídeo na esteira do Reels
                    </Typography>
                  )}
                </Stack>
              </Paper>
            </Grid>

            {/* Lane 4: Kwai */}
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 2,
                  borderRadius: 3,
                  border: 1,
                  borderColor: "divider",
                  bgcolor: (t) => alpha(t.palette.background.paper, 0.6),
                  minHeight: "70vh",
                }}
              >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <PodcastsIcon sx={{ color: "#FF7700", fontSize: 20 }} />
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Kwai
                    </Typography>
                  </Stack>
                  <Chip size="small" label={lanes.kwai.length} sx={{ fontWeight: 700 }} />
                </Stack>

                <Stack spacing={2}>
                  {lanes.kwai.map((item) => (
                    <QueueCard key={item.id} item={item} onCancel={handleCancelItem} />
                  ))}
                  {lanes.kwai.length === 0 && (
                    <Typography variant="caption" sx={{ color: "text.secondary", textAlign: "center", display: "block", py: 4 }}>
                      Nenhum vídeo na esteira do Kwai
                    </Typography>
                  )}
                </Stack>
              </Paper>
            </Grid>
          </Grid>
        )}
      </Box>

      {/* ── SCHEDULE MODAL ── */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>
          Agendar Publicação Multi-Canal
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <FormControl fullWidth>
              <InputLabel>Canal Temático de Destino</InputLabel>
              <Select
                value={selectedChannelId}
                label="Canal Temático de Destino"
                onChange={(e) => setSelectedChannelId(e.target.value)}
              >
                {channels.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name} ({c.accounts?.length || 0} redes vinculadas)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Vídeo da Biblioteca</InputLabel>
              <Select
                value={selectedVideoId}
                label="Vídeo da Biblioteca"
                onChange={(e) => setSelectedVideoId(e.target.value)}
              >
                {libraryVideos.map((v) => (
                  <MenuItem key={v.id} value={v.id}>
                    {v.title || v.id}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              fullWidth
              label="Título Personalizado (Opcional)"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Deixe em branco para usar o título original"
            />

            <Alert severity="info" sx={{ fontSize: "0.82rem" }}>
              Ao agendar, o ViralMint escalonará automaticamente as postagens nas contas vinculadas a este canal (TikTok imediatamente, YouTube Shorts em +2h, Instagram Reels em +4h e Kwai em +6h) para evitar penalidade de conteúdo duplicado.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)} disabled={scheduling}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleScheduleSubmit}
            disabled={scheduling || !selectedVideoId || !selectedChannelId}
            sx={{ fontWeight: 700 }}
          >
            {scheduling ? "Agendando..." : "Confirmar Agendamento"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function QueueCard({ item, onCancel }) {
  const theme = useTheme()
  const scheduledTime = item.scheduled_for ? new Date(item.scheduled_for).toLocaleString() : "Imediato"

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2.5,
        transition: "all 0.2s ease",
        "&:hover": {
          borderColor: "primary.main",
          boxShadow: `0 2px 12px ${alpha(theme.palette.primary.main, 0.1)}`,
        },
      }}
    >
      <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Chip
            size="small"
            color="primary"
            variant="outlined"
            icon={<BoltIcon sx={{ fontSize: 13 }} />}
            label={`Prioridade: ${(item.priority || 7.0).toFixed(1)}`}
            sx={{ height: 20, fontSize: "0.68rem", fontWeight: 700 }}
          />
          <IconButton size="small" onClick={() => onCancel(item.id)} sx={{ p: 0.25, opacity: 0.6, "&:hover": { opacity: 1, color: "error.main" } }}>
            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Stack>

        <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5, lineClamp: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {item.video_title || item.payload?.title || "Vídeo Renderizado"}
        </Typography>

        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
          Canal: <strong>{item.channel_profile_name || "Geral"}</strong>
        </Typography>

        <Divider sx={{ my: 0.75 }} />

        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="caption" sx={{ color: "text.secondary", display: "flex", alignItems: "center", gap: 0.3 }}>
            <AccessTimeIcon sx={{ fontSize: 13 }} /> {scheduledTime}
          </Typography>
          <Chip
            size="small"
            label={item.status === "published" ? "Publicado" : item.status === "failed" ? "Falha" : "Agendado"}
            color={item.status === "published" ? "success" : item.status === "failed" ? "error" : "default"}
            sx={{ height: 18, fontSize: "0.65rem", fontWeight: 600 }}
          />
        </Stack>
      </CardContent>
    </Card>
  )
}
