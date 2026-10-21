import { useState, useEffect } from "react"
import {
  Box, Stack, Typography, Card, CardContent, Button, IconButton,
  TextField, Switch, FormControlLabel, Chip, Alert, Tooltip,
  Collapse, MenuItem, Select, FormControl, InputLabel, InputAdornment,
  alpha, useTheme, Link, Avatar, Dialog, DialogTitle, DialogContent, DialogActions,
} from "@mui/material"
import YouTubeIcon from "@mui/icons-material/YouTube"
import InstagramIcon from "@mui/icons-material/Instagram"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined"
import ContentCopyIcon from "@mui/icons-material/ContentCopyOutlined"
import LinkOffIcon from "@mui/icons-material/LinkOffOutlined"
import SettingsSuggestIcon from "@mui/icons-material/SettingsSuggestOutlined"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import ExpandLessIcon from "@mui/icons-material/ExpandLess"
import KeyIcon from "@mui/icons-material/VpnKeyOutlined"
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined"
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined"
import OpenInNewIcon from "@mui/icons-material/OpenInNewOutlined"
import CookieIcon from "@mui/icons-material/CookieOutlined"
import VpnKeyIcon from "@mui/icons-material/VpnKey"
import DoneIcon from "@mui/icons-material/Done"
import AddIcon from "@mui/icons-material/Add"
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline"
import VideoLibraryIcon from "@mui/icons-material/VideoLibrary"
import http from "../../api/http"
import useAppStore from "../../store/appStore"

// TikTok custom SVG icon
function KwaiIcon({ sx = {} }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      sx={{ width: 24, height: 24, fill: "currentColor", ...sx }}
    >
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z" />
    </Box>
  )
}

function TikTokIcon({ sx = {} }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      sx={{ width: 24, height: 24, fill: "currentColor", ...sx }}
    >
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64c.29 0 .58.04.86.12V9.38a6.33 6.33 0 0 0-.86-.06A6.34 6.34 0 0 0 3.1 15.66a6.34 6.34 0 0 0 10.82 4.48 6.29 6.29 0 0 0 1.86-4.47v-6.9a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-.96-.2z" />
    </Box>
  )
}

function CopyableUri({ uri, label }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(uri)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Box sx={{ mt: 1, p: 1.25, borderRadius: 1.5, bgcolor: "action.hover", border: 1, borderColor: "divider" }}>
      <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", display: "block", mb: 0.5 }}>
        {label || "URI de Redirecionamento (Callback URI):"}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography
          variant="body2"
          sx={{
            fontFamily: "monospace",
            fontSize: "0.75rem",
            wordBreak: "break-all",
            flex: 1,
            color: "text.primary",
          }}
        >
          {uri}
        </Typography>
        <Tooltip title={copied ? "Copiado!" : "Copiar URI"}>
          <IconButton size="small" onClick={handleCopy} color={copied ? "success" : "default"}>
            {copied ? <DoneIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  )
}

export default function SocialConnectionsSection({ settings, updateSettings, fetchSettings }) {
  const theme = useTheme()
  const showToast = useAppStore((s) => s.showToast || s.showSnackbar)

  // Multi-account groupings
  const allAccounts = settings?.connected_accounts || []
  const ytAccounts = allAccounts.filter((a) => a.platform === "youtube")
  const ttAccounts = allAccounts.filter((a) => a.platform === "tiktok")
  const igAccounts = allAccounts.filter((a) => a.platform === "instagram")
  const kwaiAccounts = allAccounts.filter((a) => a.platform === "kwai")

  // Kwai Add Modal State
  const [openKwaiModal, setOpenKwaiModal] = useState(false)
  const [kwaiName, setKwaiName] = useState("")
  const [kwaiId, setKwaiId] = useState("")
  const [kwaiWebhook, setKwaiWebhook] = useState("")
  const [savingKwai, setSavingKwai] = useState(false)

  const handleSaveKwaiAccount = async () => {
    if (!kwaiName.trim()) {
      showToast?.("Informe o nome do canal/perfil Kwai", "warning")
      return
    }
    setSavingKwai(true)
    try {
      await http.post("/api/settings/kwai-account", {
        account_name: kwaiName.trim(),
        account_id: kwaiId.trim() || kwaiName.trim(),
        webhook_url: kwaiWebhook.trim() || undefined,
      })
      showToast?.(`Conta Kwai "${kwaiName}" adicionada com sucesso!`, "success")
      setKwaiName("")
      setKwaiId("")
      setKwaiWebhook("")
      setOpenKwaiModal(false)
      if (fetchSettings) fetchSettings()
    } catch (e) {
      showToast?.("Erro ao adicionar conta Kwai: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setSavingKwai(false)
    }
  }

  const handleDeleteAccount = async (accountId, accountName) => {
    if (!window.confirm(`Deseja realmente desconectar a conta "${accountName}"?`)) return
    try {
      setLoadingAction(`del_${accountId}`)
      await http.delete(`/api/settings/social-account/${accountId}`)
      showToast?.(`Conta "${accountName}" desconectada com sucesso.`, "info")
      if (fetchSettings) fetchSettings()
    } catch (e) {
      showToast?.("Erro ao desconectar conta: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setLoadingAction(null)
    }
  }

  // Accordion expanded states
  const [expandedPlatform, setExpandedPlatform] = useState(null)

  // Loading states
  const [loadingAction, setLoadingAction] = useState(null)

  // YouTube OAuth BYOK inputs
  const [ytClientId, setYtClientId] = useState("")
  const [ytClientSecret, setYtClientSecret] = useState("")
  const [showYtSecret, setShowYtSecret] = useState(false)

  // TikTok BYOK inputs & Cookie
  const [ttClientKey, setTtClientKey] = useState("")
  const [ttClientSecret, setTtClientSecret] = useState("")
  const [showTtSecret, setShowTtSecret] = useState(false)
  const [ttCookie, setTtCookie] = useState("")
  const [testingCookie, setTestingCookie] = useState(false)

  // Instagram BYOK & Direct Token inputs
  const [igClientId, setIgClientId] = useState("")
  const [igClientSecret, setIgClientSecret] = useState("")
  const [showIgSecret, setShowIgSecret] = useState(false)
  const [igDirectToken, setIgDirectToken] = useState("")
  const [igDirectUserId, setIgDirectUserId] = useState("")
  const [showIgToken, setShowIgToken] = useState(false)
  const [connectingDirectIg, setConnectingDirectIg] = useState(false)

  // Base URL calculation for OAuth callbacks
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:16888"
  const ytCallbackUri = `${origin}/api/settings/youtube-callback`
  const ttCallbackUri = `${origin}/api/settings/tiktok-upload-callback`
  const igCallbackUri = `${origin}/api/settings/instagram-callback`

  const toggleExpand = (platform) => {
    setExpandedPlatform(expandedPlatform === platform ? null : platform)
  }

  // Sincronizar campos de Client ID com o que já está salvo no servidor
  useEffect(() => {
    if (settings) {
      if (settings.youtube_client_id !== undefined && settings.youtube_client_id !== null) {
        setYtClientId(settings.youtube_client_id)
      }
      if (settings.tiktok_client_key !== undefined && settings.tiktok_client_key !== null) {
        setTtClientKey(settings.tiktok_client_key)
      }
      if (settings.instagram_client_id !== undefined && settings.instagram_client_id !== null) {
        setIgClientId(settings.instagram_client_id)
      }
      if (settings.instagram_user_id !== undefined && settings.instagram_user_id !== null) {
        setIgDirectUserId(settings.instagram_user_id)
      }
    }
  }, [
    settings?.youtube_client_id,
    settings?.tiktok_client_key,
    settings?.instagram_client_id,
    settings?.instagram_user_id,
  ])

  // ── YouTube Actions ──
  const handleConnectYoutube = async () => {
    const hasClientId = settings?.youtube_client_id_set || ytClientId.trim()
    const hasClientSecret = settings?.youtube_client_secret_set || ytClientSecret.trim()

    if (!hasClientId || !hasClientSecret) {
      setExpandedPlatform("youtube")
      showToast?.("Configure o Google OAuth Client ID e Client Secret abaixo antes de conectar.", "warning")
      return
    }

    // Se o usuário preencheu novos valores no formulário, salva antes de redirecionar
    if (ytClientId.trim() || ytClientSecret.trim()) {
      setLoadingAction("youtube")
      try {
        const payload = {}
        if (ytClientId.trim()) payload.youtube_client_id = ytClientId.trim()
        if (ytClientSecret.trim()) payload.youtube_client_secret = ytClientSecret.trim()
        await updateSettings(payload)
      } catch (e) {
        showToast?.("Erro ao salvar credenciais: " + (e.response?.data?.detail || e.message), "error")
        setLoadingAction(null)
        return
      }
    }

    setLoadingAction("youtube")
    const authUrl = `/api/settings/youtube-auth?redirect_uri=${encodeURIComponent(ytCallbackUri)}`
    window.location.href = authUrl
  }

  const handleDisconnectYoutube = async () => {
    if (!window.confirm("Deseja realmente desconectar sua conta do YouTube?")) return
    try {
      setLoadingAction("youtube_dc")
      await http.post("/api/settings/youtube-disconnect")
      showToast?.("Conta do YouTube desconectada", "info")
      if (fetchSettings) fetchSettings()
    } catch (e) {
      showToast?.("Erro ao desconectar YouTube: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setLoadingAction(null)
    }
  }

  const handleSaveYoutubeCreds = async () => {
    const payload = {}
    if (ytClientId.trim()) payload.youtube_client_id = ytClientId.trim()
    if (ytClientSecret.trim()) payload.youtube_client_secret = ytClientSecret.trim()
    if (!payload.youtube_client_id && !payload.youtube_client_secret) {
      showToast?.("Preencha ao menos o Client ID ou Client Secret para salvar.", "warning")
      return
    }
    try {
      setLoadingAction("youtube_save")
      await updateSettings(payload)
      showToast?.("Credenciais do YouTube salvas com sucesso!", "success")
      setYtClientSecret("")
      if (fetchSettings) fetchSettings()
    } catch (e) {
      showToast?.("Erro ao salvar credenciais: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setLoadingAction(null)
    }
  }

  const handleClearYoutubeCreds = async () => {
    if (!window.confirm("Deseja realmente remover as credenciais salvas do Google OAuth?")) return
    try {
      setLoadingAction("youtube_clear")
      await http.post("/api/settings/clear-oauth-creds", { platform: "youtube" })
      setYtClientId("")
      setYtClientSecret("")
      showToast?.("Credenciais do Google OAuth removidas com sucesso.", "info")
      if (fetchSettings) fetchSettings()
    } catch (e) {
      showToast?.("Erro ao remover credenciais: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setLoadingAction(null)
    }
  }

  // ── TikTok Actions ──
  const handleConnectTiktok = async () => {
    const hasClientKey = settings?.tiktok_client_key_set || ttClientKey.trim()
    const hasClientSecret = settings?.tiktok_client_secret_set || ttClientSecret.trim()

    if (!hasClientKey || !hasClientSecret) {
      setExpandedPlatform("tiktok")
      showToast?.("Configure o Client Key e Client Secret do TikTok abaixo antes de conectar.", "warning")
      return
    }

    if (ttClientKey.trim() || ttClientSecret.trim()) {
      setLoadingAction("tiktok")
      try {
        const payload = {}
        if (ttClientKey.trim()) payload.tiktok_client_key = ttClientKey.trim()
        if (ttClientSecret.trim()) payload.tiktok_client_secret = ttClientSecret.trim()
        await updateSettings(payload)
      } catch (e) {
        showToast?.("Erro ao salvar credenciais: " + (e.response?.data?.detail || e.message), "error")
        setLoadingAction(null)
        return
      }
    }

    setLoadingAction("tiktok")
    const authUrl = `/api/settings/tiktok-upload-auth?redirect_uri=${encodeURIComponent(ttCallbackUri)}`
    window.location.href = authUrl
  }

  const handleDisconnectTiktok = async () => {
    if (!window.confirm("Deseja realmente desconectar sua conta do TikTok?")) return
    try {
      setLoadingAction("tiktok_dc")
      await http.post("/api/settings/tiktok-disconnect")
      showToast?.("Conta do TikTok desconectada", "info")
      if (fetchSettings) fetchSettings()
    } catch (e) {
      showToast?.("Erro ao desconectar TikTok: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setLoadingAction(null)
    }
  }

  const handleSaveTiktokCreds = async () => {
    const payload = {}
    if (ttClientKey.trim()) payload.tiktok_client_key = ttClientKey.trim()
    if (ttClientSecret.trim()) payload.tiktok_client_secret = ttClientSecret.trim()
    if (!payload.tiktok_client_key && !payload.tiktok_client_secret) {
      showToast?.("Preencha ao menos o Client Key ou Client Secret para salvar.", "warning")
      return
    }
    try {
      setLoadingAction("tiktok_save")
      await updateSettings(payload)
      showToast?.("Credenciais do TikTok salvas com sucesso!", "success")
      setTtClientSecret("")
      if (fetchSettings) fetchSettings()
    } catch (e) {
      showToast?.("Erro ao salvar credenciais: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setLoadingAction(null)
    }
  }

  const handleClearTiktokCreds = async () => {
    if (!window.confirm("Deseja realmente remover as credenciais salvas do TikTok?")) return
    try {
      setLoadingAction("tiktok_clear")
      await http.post("/api/settings/clear-oauth-creds", { platform: "tiktok" })
      setTtClientKey("")
      setTtClientSecret("")
      showToast?.("Credenciais do TikTok removidas com sucesso.", "info")
      if (fetchSettings) fetchSettings()
    } catch (e) {
      showToast?.("Erro ao remover credenciais: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setLoadingAction(null)
    }
  }

  const handleTestAndSaveTiktokCookie = async () => {
    if (!ttCookie.trim()) {
      showToast("Cole o cookie sessionid do TikTok", "warning")
      return
    }
    setTestingCookie(true)
    try {
      const resp = await http.post("/api/settings/test-cookie", {
        platform: "tiktok",
        cookie: ttCookie.trim(),
      })
      if (resp.data?.ok) {
        await updateSettings({ tiktok_cookie: ttCookie.trim() })
        showToast("Cookie validado e salvo com sucesso!", "success")
        setTtCookie("")
      } else {
        showToast("Cookie inválido: " + (resp.data?.error || "Falha na verificação"), "error")
      }
    } catch (e) {
      showToast("Erro ao testar cookie: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setTestingCookie(false)
    }
  }

  // ── Instagram Actions ──
  const handleConnectInstagram = async () => {
    const hasClientId = settings?.instagram_client_id_set || igClientId.trim()
    const hasClientSecret = settings?.instagram_client_secret_set || igClientSecret.trim()

    if (!hasClientId || !hasClientSecret) {
      setExpandedPlatform("instagram")
      showToast?.("Configure o Meta App ID e App Secret abaixo antes de conectar.", "warning")
      return
    }

    if (igClientId.trim() || igClientSecret.trim()) {
      setLoadingAction("instagram")
      try {
        const payload = {}
        if (igClientId.trim()) payload.instagram_client_id = igClientId.trim()
        if (igClientSecret.trim()) payload.instagram_client_secret = igClientSecret.trim()
        await updateSettings(payload)
      } catch (e) {
        showToast?.("Erro ao salvar credenciais: " + (e.response?.data?.detail || e.message), "error")
        setLoadingAction(null)
        return
      }
    }

    setLoadingAction("instagram")
    const authUrl = `/api/settings/instagram-auth?redirect_uri=${encodeURIComponent(igCallbackUri)}`
    window.location.href = authUrl
  }

  const handleDisconnectInstagram = async () => {
    if (!window.confirm("Deseja realmente desconectar sua conta do Instagram Reels?")) return
    try {
      setLoadingAction("instagram_dc")
      await http.post("/api/settings/instagram-disconnect")
      showToast?.("Conta do Instagram desconectada", "info")
      if (fetchSettings) fetchSettings()
    } catch (e) {
      showToast?.("Erro ao desconectar Instagram: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setLoadingAction(null)
    }
  }

  const handleSaveInstagramCreds = async () => {
    const payload = {}
    if (igClientId.trim()) payload.instagram_client_id = igClientId.trim()
    if (igClientSecret.trim()) payload.instagram_client_secret = igClientSecret.trim()
    if (!payload.instagram_client_id && !payload.instagram_client_secret) {
      showToast?.("Preencha ao menos o App ID ou App Secret para salvar.", "warning")
      return
    }
    try {
      setLoadingAction("instagram_save")
      await updateSettings(payload)
      showToast?.("Credenciais do Instagram salvas com sucesso!", "success")
      setIgClientSecret("")
      if (fetchSettings) fetchSettings()
    } catch (e) {
      showToast?.("Erro ao salvar credenciais: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setLoadingAction(null)
    }
  }

  const handleClearInstagramCreds = async () => {
    if (!window.confirm("Deseja realmente remover as credenciais salvas do Meta/Instagram?")) return
    try {
      setLoadingAction("instagram_clear")
      await http.post("/api/settings/clear-oauth-creds", { platform: "instagram" })
      setIgClientId("")
      setIgClientSecret("")
      showToast?.("Credenciais do Meta/Instagram removidas com sucesso.", "info")
      if (fetchSettings) fetchSettings()
    } catch (e) {
      showToast?.("Erro ao remover credenciais: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setLoadingAction(null)
    }
  }

  const handleDirectConnectInstagram = async () => {
    if (!igDirectToken.trim()) {
      showToast("Cole o Access Token do Instagram / Meta", "warning")
      return
    }
    setConnectingDirectIg(true)
    try {
      const resp = await http.post("/api/settings/instagram-direct-connect", {
        access_token: igDirectToken.trim(),
        ig_user_id: igDirectUserId.trim() || undefined,
      })
      if (resp.data?.ok) {
        showToast(`Instagram conectado: @${resp.data?.account_name || "Business"}`, "success")
        setIgDirectToken("")
        setIgDirectUserId("")
        if (fetchSettings) fetchSettings()
      } else {
        showToast("Erro ao conectar: " + (resp.data?.error || "Token inválido"), "error")
      }
    } catch (e) {
      showToast("Falha na conexão: " + (e.response?.data?.detail || e.message), "error")
    } finally {
      setConnectingDirectIg(false)
    }
  }

  return (
    <Stack spacing={2.5}>
      <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "0.85rem" }}>
        Conecte seus canais e perfis oficiais para permitir o agendamento de posts e a publicação direta de vídeos
        e cortes virais com 1 clique para YouTube Shorts, TikTok e Instagram Reels.
      </Typography>

      {/* ── CARD 1: YOUTUBE SHORTS ── */}
      <Card
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2,
          borderColor: settings?.youtube_connected ? "success.main" : "divider",
          bgcolor: (t) =>
            settings?.youtube_connected
              ? alpha(t.palette.success.main, 0.03)
              : t.palette.background.paper,
        }}
      >
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: alpha("#FF0000", 0.1),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <YouTubeIcon sx={{ color: "#FF0000", fontSize: 28 }} />
              </Box>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    YouTube Shorts & Vídeos
                  </Typography>
                  {ytAccounts.length > 0 || settings?.youtube_connected ? (
                    <Chip
                      icon={<CheckCircleIcon sx={{ fontSize: "16px !important" }} />}
                      label={`Conectado (${ytAccounts.length > 0 ? `${ytAccounts.length} canal/canais` : "1 canal"})`}
                      color="success"
                      size="small"
                      sx={{ fontWeight: 600, height: 24 }}
                    />
                  ) : (
                    <Chip label="Não conectado" size="small" variant="outlined" sx={{ height: 24 }} />
                  )}
                </Stack>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {ytAccounts.length > 0
                    ? `${ytAccounts.length} canal(is) pronto(s) para postagens e scouting multi-nicho`
                    : settings?.youtube_connected
                    ? `Canal: ${settings?.youtube_channel_title || "Canal Autorizado"}`
                    : "Upload via YouTube Data API v3 oficial (OAuth 2.0)"}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              {ytAccounts.length > 0 || settings?.youtube_connected ? (
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={handleConnectYoutube}
                    disabled={loadingAction === "youtube"}
                    sx={{
                      bgcolor: "#FF0000",
                      "&:hover": { bgcolor: "#CC0000" },
                      fontWeight: 600,
                    }}
                  >
                    + Conectar Outro Canal
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<LinkOffIcon />}
                    onClick={handleDisconnectYoutube}
                    disabled={loadingAction === "youtube_dc"}
                  >
                    Desconectar
                  </Button>
                </Stack>
              ) : (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<YouTubeIcon />}
                  onClick={handleConnectYoutube}
                  disabled={loadingAction === "youtube"}
                  sx={{
                    bgcolor: "#FF0000",
                    "&:hover": { bgcolor: "#CC0000" },
                    fontWeight: 600,
                  }}
                >
                  Conectar YouTube
                </Button>
              )}
              <IconButton size="small" onClick={() => toggleExpand("youtube")}>
                {expandedPlatform === "youtube" ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Stack>
          </Stack>

          {/* Quick toggle for default publishing */}
          <FormControlLabel
            control={
              <Switch
                checked={!!settings?.upload_to_youtube}
                onChange={(e) => updateSettings({ upload_to_youtube: e.target.checked })}
                color="primary"
                size="small"
              />
            }
            label={
              <Typography variant="body2" sx={{ fontSize: "0.825rem", color: "text.secondary" }}>
                Publicar automaticamente no YouTube por padrão na esteira de geração
              </Typography>
            }
          />

          {/* Lista de Canais Conectados do YouTube */}
          {ytAccounts.length > 0 && (
            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: (t) => alpha(t.palette.background.default, 0.6), border: 1, borderColor: "divider" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}>
                Canais do YouTube Vinculados ({ytAccounts.length})
              </Typography>
              <Stack spacing={1}>
                {ytAccounts.map((acc) => (
                  <Stack
                    key={acc.id}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ p: 1.25, borderRadius: 1, bgcolor: "background.paper", border: 1, borderColor: "divider" }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Avatar src={acc.avatar_url} sx={{ width: 32, height: 32, bgcolor: alpha("#FF0000", 0.1), color: "#FF0000", fontSize: "0.85rem", fontWeight: 700 }}>
                        {acc.account_name?.charAt(0) || "Y"}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {acc.account_name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "monospace" }}>
                          {acc.account_id || "ID do Canal"}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip label="Ativo" size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: "0.75rem" }} />
                      <Tooltip title="Desconectar este canal">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteAccount(acc.id, acc.account_name)}
                          disabled={loadingAction === `del_${acc.id}`}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          {/* Accordion: OAuth Client ID & Secret configuration */}
          <Collapse in={expandedPlatform === "youtube"}>
            <Box
              sx={{
                p: 2,
                mt: 1,
                borderRadius: 1.5,
                bgcolor: (t) => alpha(t.palette.background.default, 0.6),
                border: 1,
                borderColor: "divider",
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
                <KeyIcon fontSize="small" color="primary" /> Credenciais do Aplicativo OAuth Google (BYOK)
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
                Para conectar sua conta, cadastre um aplicativo no{" "}
                <Link
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener"
                  sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}
                >
                  Google Cloud Console <OpenInNewIcon sx={{ fontSize: 12 }} />
                </Link>{" "}
                (Tipo: Aplicativo da Web), copie a URI abaixo e preencha as chaves:
              </Typography>

              <CopyableUri uri={ytCallbackUri} label="URI de Redirecionamento autorizada para o Google Cloud Console:" />

              <Stack spacing={1.5} sx={{ mt: 2 }}>
                <TextField
                  label="Google OAuth Client ID"
                  placeholder="Ex: 123456789-abc.apps.googleusercontent.com"
                  size="small"
                  fullWidth
                  value={ytClientId}
                  onChange={(e) => setYtClientId(e.target.value)}
                  helperText={
                    settings?.youtube_client_id_set
                      ? "✓ Client ID salvo e ativo no servidor"
                      : "Cole o Client ID gerado no Google Cloud Console"
                  }
                />
                <TextField
                  label="Google OAuth Client Secret"
                  placeholder={settings?.youtube_client_secret_set ? "••••••••••••••••" : "Ex: GOCSPX-..."}
                  type={showYtSecret ? "text" : "password"}
                  size="small"
                  fullWidth
                  value={ytClientSecret}
                  onChange={(e) => setYtClientSecret(e.target.value)}
                  helperText={
                    settings?.youtube_client_secret_set
                      ? "✓ Client Secret já configurado e ativo (preencha somente se desejar alterar)"
                      : "Cole o Client Secret gerado no Google Cloud Console"
                  }
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowYtSecret(!showYtSecret)}>
                          {showYtSecret ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  {(settings?.youtube_client_id_set || settings?.youtube_client_secret_set) && (
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={handleClearYoutubeCreds}
                      disabled={loadingAction === "youtube_clear"}
                    >
                      Remover Credenciais
                    </Button>
                  )}
                  <Button
                    variant="contained"
                    size="small"
                    onClick={handleSaveYoutubeCreds}
                    disabled={(!ytClientId && !ytClientSecret) || loadingAction === "youtube_save"}
                  >
                    Salvar Credenciais
                  </Button>
                </Stack>
              </Stack>
            </Box>
          </Collapse>
        </Stack>
      </Card>

      {/* ── CARD 2: TIKTOK ── */}
      <Card
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2,
          borderColor:
            settings?.tiktok_upload_connected || settings?.tiktok_cookie_set
              ? "success.main"
              : "divider",
          bgcolor: (t) =>
            settings?.tiktok_upload_connected || settings?.tiktok_cookie_set
              ? alpha(t.palette.success.main, 0.03)
              : t.palette.background.paper,
        }}
      >
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: (t) => (t.palette.mode === "dark" ? alpha("#fe2c55", 0.15) : alpha("#000000", 0.06)),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <TikTokIcon sx={{ color: (t) => (t.palette.mode === "dark" ? "#25F4EE" : "#000000") }} />
              </Box>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    TikTok (Content Posting API & Cookie)
                  </Typography>
                  {ttAccounts.length > 0 || settings?.tiktok_upload_connected ? (
                    <Chip
                      icon={<CheckCircleIcon sx={{ fontSize: "16px !important" }} />}
                      label={`Conectado (${ttAccounts.length > 0 ? `${ttAccounts.length} conta(s)` : "1 conta"})`}
                      color="success"
                      size="small"
                      sx={{ fontWeight: 600, height: 24 }}
                    />
                  ) : settings?.tiktok_cookie_set ? (
                    <Chip
                      icon={<CookieIcon sx={{ fontSize: "16px !important" }} />}
                      label="Sessão Web (Cookie)"
                      color="info"
                      size="small"
                      sx={{ fontWeight: 600, height: 24 }}
                    />
                  ) : (
                    <Chip label="Não conectado" size="small" variant="outlined" sx={{ height: 24 }} />
                  )}
                </Stack>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {ttAccounts.length > 0
                    ? `${ttAccounts.length} conta(s) do TikTok conectada(s) para publicação`
                    : settings?.tiktok_upload_connected
                    ? "Conectado via TikTok Content Posting API oficial"
                    : settings?.tiktok_cookie_set
                    ? "Upload automatizado via sessão Web do TikTok"
                    : "Conecte via OAuth oficial ou cole o cookie sessionid"}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              {ttAccounts.length > 0 || settings?.tiktok_upload_connected || settings?.tiktok_cookie_set ? (
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={handleConnectTiktok}
                    disabled={loadingAction === "tiktok"}
                    sx={{
                      bgcolor: (t) => (t.palette.mode === "dark" ? "#fe2c55" : "#000000"),
                      color: "#ffffff",
                      "&:hover": { bgcolor: (t) => (t.palette.mode === "dark" ? "#e0264a" : "#222222") },
                      fontWeight: 600,
                    }}
                  >
                    + Conectar Outra Conta
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<LinkOffIcon />}
                    onClick={handleDisconnectTiktok}
                    disabled={loadingAction === "tiktok_dc"}
                  >
                    Desconectar
                  </Button>
                </Stack>
              ) : (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<TikTokIcon sx={{ width: 18, height: 18 }} />}
                  onClick={handleConnectTiktok}
                  disabled={loadingAction === "tiktok"}
                  sx={{
                    bgcolor: (t) => (t.palette.mode === "dark" ? "#fe2c55" : "#000000"),
                    color: "#ffffff",
                    "&:hover": { bgcolor: (t) => (t.palette.mode === "dark" ? "#e0264a" : "#222222") },
                    fontWeight: 600,
                  }}
                >
                  Conectar TikTok
                </Button>
              )}
              <IconButton size="small" onClick={() => toggleExpand("tiktok")}>
                {expandedPlatform === "tiktok" ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Stack>
          </Stack>

          {/* Lista de Contas Conectadas do TikTok */}
          {ttAccounts.length > 0 && (
            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: (t) => alpha(t.palette.background.default, 0.6), border: 1, borderColor: "divider" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}>
                Contas do TikTok Vinculadas ({ttAccounts.length})
              </Typography>
              <Stack spacing={1}>
                {ttAccounts.map((acc) => (
                  <Stack
                    key={acc.id}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ p: 1.25, borderRadius: 1, bgcolor: "background.paper", border: 1, borderColor: "divider" }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Avatar src={acc.avatar_url} sx={{ width: 32, height: 32, bgcolor: (t) => alpha(t.palette.text.primary, 0.1), color: "text.primary", fontSize: "0.85rem", fontWeight: 700 }}>
                        {acc.account_name?.charAt(0) || "T"}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {acc.account_name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "monospace" }}>
                          {acc.account_id || "ID TikTok"}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip label="Ativo" size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: "0.75rem" }} />
                      <Tooltip title="Desconectar esta conta">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteAccount(acc.id, acc.account_name)}
                          disabled={loadingAction === `del_${acc.id}`}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems={{ sm: "center" }}>
            <FormControlLabel
              control={
                <Switch
                  checked={!!settings?.upload_to_tiktok}
                  onChange={(e) => updateSettings({ upload_to_tiktok: e.target.checked })}
                  color="primary"
                  size="small"
                />
              }
              label={
                <Typography variant="body2" sx={{ fontSize: "0.825rem", color: "text.secondary" }}>
                  Publicar automaticamente no TikTok
                </Typography>
              }
            />

            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="tt-privacy-label" sx={{ fontSize: "0.8rem" }}>Privacidade Padrão</InputLabel>
              <Select
                labelId="tt-privacy-label"
                value={settings?.tiktok_default_privacy || "PUBLIC_TO_EVERYONE"}
                label="Privacidade Padrão"
                onChange={(e) => updateSettings({ tiktok_default_privacy: e.target.value })}
                sx={{ height: 34, fontSize: "0.825rem" }}
              >
                <MenuItem value="PUBLIC_TO_EVERYONE">Público (Todos)</MenuItem>
                <MenuItem value="MUTUAL_FOLLOW_FRIENDS">Apenas Amigos</MenuItem>
                <MenuItem value="SELF_ONLY">Privado (Apenas Você)</MenuItem>
              </Select>
            </FormControl>
          </Stack>

          {/* Accordion: TikTok OAuth BYOK + Cookie */}
          <Collapse in={expandedPlatform === "tiktok"}>
            <Stack spacing={2} sx={{ p: 2, mt: 1, borderRadius: 1.5, bgcolor: (t) => alpha(t.palette.background.default, 0.6), border: 1, borderColor: "divider" }}>
              {/* Option 1: Official OAuth */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
                  <KeyIcon fontSize="small" color="primary" /> Método 1: TikTok for Developers (OAuth Oficial)
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
                  Configure as credenciais no{" "}
                  <Link
                    href="https://developers.tiktok.com/"
                    target="_blank"
                    rel="noopener"
                    sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}
                  >
                    TikTok Developer Portal <OpenInNewIcon sx={{ fontSize: 12 }} />
                  </Link>{" "}
                  com os escopos <code style={{ fontSize: "0.75rem" }}>video.upload,video.publish</code>:
                </Typography>

                <CopyableUri uri={ttCallbackUri} label="Redirect URI autorizada para o TikTok Developer Portal:" />

                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  <TextField
                    label="TikTok Client Key"
                    placeholder="Ex: aw..."
                    size="small"
                    fullWidth
                    value={ttClientKey}
                    onChange={(e) => setTtClientKey(e.target.value)}
                    helperText={
                      settings?.tiktok_client_key_set
                        ? "✓ Client Key salvo e ativo no servidor"
                        : "Cole o Client Key do TikTok Developer Portal"
                    }
                  />
                  <TextField
                    label="TikTok Client Secret"
                    placeholder={settings?.tiktok_client_secret_set ? "••••••••••••••••" : "Ex: secret..."}
                    type={showTtSecret ? "text" : "password"}
                    size="small"
                    fullWidth
                    value={ttClientSecret}
                    onChange={(e) => setTtClientSecret(e.target.value)}
                    helperText={
                      settings?.tiktok_client_secret_set
                        ? "✓ Client Secret já configurado e ativo (preencha somente se desejar alterar)"
                        : "Cole o Client Secret do TikTok Developer Portal"
                    }
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowTtSecret(!showTtSecret)}>
                            {showTtSecret ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    {(settings?.tiktok_client_key_set || settings?.tiktok_client_secret_set) && (
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={handleClearTiktokCreds}
                        disabled={loadingAction === "tiktok_clear"}
                      >
                        Remover Credenciais
                      </Button>
                    )}
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleSaveTiktokCreds}
                      disabled={(!ttClientKey && !ttClientSecret) || loadingAction === "tiktok_save"}
                    >
                      Salvar Credenciais
                    </Button>
                  </Stack>
                </Stack>
              </Box>

              {/* Option 2: Cookie connection */}
              <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
                  <CookieIcon fontSize="small" color="secondary" /> Método 2: Conexão via Cookie de Sessão Web
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
                  Alternativa sem precisar de conta de desenvolvedor: extraia o cookie <code style={{ fontSize: "0.75rem" }}>sessionid</code> do tiktok.com logado no navegador:
                </Typography>

                <Stack spacing={1.5}>
                  <TextField
                    label="Cookie sessionid do TikTok"
                    placeholder="Cole o valor do cookie sessionid aqui..."
                    size="small"
                    fullWidth
                    value={ttCookie}
                    onChange={(e) => setTtCookie(e.target.value)}
                    helperText={settings?.tiktok_cookie_set ? "✓ Cookie de sessão ativo" : ""}
                  />
                  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                      variant="outlined"
                      color="secondary"
                      size="small"
                      onClick={handleTestAndSaveTiktokCookie}
                      disabled={!ttCookie.trim() || testingCookie}
                    >
                      {testingCookie ? "Validando..." : "Testar & Salvar Cookie"}
                    </Button>
                  </Box>
                </Stack>
              </Box>
            </Stack>
          </Collapse>
        </Stack>
      </Card>

      {/* ── CARD 3: INSTAGRAM REELS ── */}
      <Card
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2,
          borderColor: settings?.instagram_connected ? "success.main" : "divider",
          bgcolor: (t) =>
            settings?.instagram_connected
              ? alpha(t.palette.success.main, 0.03)
              : t.palette.background.paper,
        }}
      >
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#ffffff",
                }}
              >
                <InstagramIcon sx={{ fontSize: 26 }} />
              </Box>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Instagram Reels (Meta Graph API)
                  </Typography>
                  {igAccounts.length > 0 || settings?.instagram_connected ? (
                    <Chip
                      icon={<CheckCircleIcon sx={{ fontSize: "16px !important" }} />}
                      label={`Conectado (${igAccounts.length > 0 ? `${igAccounts.length} perfil/perfis` : "1 perfil"})`}
                      color="success"
                      size="small"
                      sx={{ fontWeight: 600, height: 24 }}
                    />
                  ) : (
                    <Chip label="Não conectado" size="small" variant="outlined" sx={{ height: 24 }} />
                  )}
                </Stack>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {igAccounts.length > 0
                    ? `${igAccounts.length} perfil(is) do Instagram conectado(s) para Reels`
                    : settings?.instagram_connected
                    ? `Conta: @${settings?.instagram_account_name || "Instagram Business"} ${
                        settings?.instagram_user_id ? `(ID: ${settings?.instagram_user_id})` : ""
                      }`
                    : "Publicação automática via Instagram Professional / Graph API v19.0"}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              {igAccounts.length > 0 || settings?.instagram_connected ? (
                <Stack direction="row" spacing={1}>
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={handleConnectInstagram}
                    disabled={loadingAction === "instagram"}
                    sx={{
                      background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                      color: "#ffffff",
                      fontWeight: 600,
                    }}
                  >
                    + Conectar Outro Perfil
                  </Button>
                  <Button
                    variant="outlined"
                    color="error"
                    size="small"
                    startIcon={<LinkOffIcon />}
                    onClick={handleDisconnectInstagram}
                    disabled={loadingAction === "instagram_dc"}
                  >
                    Desconectar
                  </Button>
                </Stack>
              ) : (
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<InstagramIcon />}
                  onClick={handleConnectInstagram}
                  disabled={loadingAction === "instagram"}
                  sx={{
                    background: "linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)",
                    color: "#ffffff",
                    fontWeight: 600,
                  }}
                >
                  Conectar Instagram
                </Button>
              )}
              <IconButton size="small" onClick={() => toggleExpand("instagram")}>
                {expandedPlatform === "instagram" ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
            </Stack>
          </Stack>

          {/* Lista de Perfis Conectados do Instagram */}
          {igAccounts.length > 0 && (
            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: (t) => alpha(t.palette.background.default, 0.6), border: 1, borderColor: "divider" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}>
                Perfis do Instagram Vinculados ({igAccounts.length})
              </Typography>
              <Stack spacing={1}>
                {igAccounts.map((acc) => (
                  <Stack
                    key={acc.id}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ p: 1.25, borderRadius: 1, bgcolor: "background.paper", border: 1, borderColor: "divider" }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Avatar src={acc.avatar_url} sx={{ width: 32, height: 32, background: "linear-gradient(45deg, #f09433, #dc2743)", color: "#ffffff", fontSize: "0.85rem", fontWeight: 700 }}>
                        {acc.account_name?.charAt(0) || "I"}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {acc.account_name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "monospace" }}>
                          {acc.account_id || "ID Instagram"}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip label="Ativo" size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: "0.75rem" }} />
                      <Tooltip title="Desconectar este perfil">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteAccount(acc.id, acc.account_name)}
                          disabled={loadingAction === `del_${acc.id}`}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}

          <FormControlLabel
            control={
              <Switch
                checked={!!settings?.upload_to_instagram}
                onChange={(e) => updateSettings({ upload_to_instagram: e.target.checked })}
                color="primary"
                size="small"
              />
            }
            label={
              <Typography variant="body2" sx={{ fontSize: "0.825rem", color: "text.secondary" }}>
                Publicar automaticamente no Instagram Reels por padrão na esteira de geração
              </Typography>
            }
          />

          {/* Accordion: Instagram Token Direct & Meta OAuth */}
          <Collapse in={expandedPlatform === "instagram"}>
            <Stack spacing={2} sx={{ p: 2, mt: 1, borderRadius: 1.5, bgcolor: (t) => alpha(t.palette.background.default, 0.6), border: 1, borderColor: "divider" }}>
              {/* Method A: Direct Long-Lived Token */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
                  <VpnKeyIcon fontSize="small" color="secondary" /> Método 1: Conexão Direta via Access Token (Mais Rápido / BYOK)
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
                  Gere um Token de Acesso de Longa Duração (System User ou User Token) no{" "}
                  <Link
                    href="https://developers.facebook.com/tools/explorer/"
                    target="_blank"
                    rel="noopener"
                    sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}
                  >
                    Meta Graph API Explorer <OpenInNewIcon sx={{ fontSize: 12 }} />
                  </Link>{" "}
                  com permissão <code style={{ fontSize: "0.75rem" }}>instagram_content_publish</code> e vincule sua Página do Facebook conectada ao Instagram Professional:
                </Typography>

                <Stack spacing={1.5}>
                  <TextField
                    label="Instagram Access Token (Meta Graph API)"
                    placeholder="EAA..."
                    type={showIgToken ? "text" : "password"}
                    size="small"
                    fullWidth
                    value={igDirectToken}
                    onChange={(e) => setIgDirectToken(e.target.value)}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowIgToken(!showIgToken)}>
                            {showIgToken ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                    helperText={settings?.instagram_access_token_set ? "✓ Access token ativo configurado" : ""}
                  />
                  <TextField
                    label="Instagram Business Account ID (Opcional - detectado automaticamente)"
                    placeholder="Ex: 178414..."
                    size="small"
                    fullWidth
                    value={igDirectUserId}
                    onChange={(e) => setIgDirectUserId(e.target.value)}
                  />
                  <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                    <Button
                      variant="outlined"
                      color="secondary"
                      size="small"
                      onClick={handleDirectConnectInstagram}
                      disabled={!igDirectToken.trim() || connectingDirectIg}
                    >
                      {connectingDirectIg ? "Verificando..." : "Testar & Conectar Instagram"}
                    </Button>
                  </Box>
                </Stack>
              </Box>

              {/* Method B: Meta App OAuth */}
              <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider" }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
                  <KeyIcon fontSize="small" color="primary" /> Método 2: Aplicativo Meta Developers (OAuth Oficial)
                </Typography>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
                  Cadastre um aplicativo no{" "}
                  <Link
                    href="https://developers.facebook.com/apps/"
                    target="_blank"
                    rel="noopener"
                    sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}
                  >
                    Meta for Developers <OpenInNewIcon sx={{ fontSize: 12 }} />
                  </Link>{" "}
                  com o produto 'Facebook Login for Business' / 'Instagram Graph API':
                </Typography>

                <CopyableUri uri={igCallbackUri} label="URI de Redirecionamento autorizada para o Meta App:" />

                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  <TextField
                    label="Meta App ID (Client ID)"
                    placeholder="Ex: 154..."
                    size="small"
                    fullWidth
                    value={igClientId}
                    onChange={(e) => setIgClientId(e.target.value)}
                    helperText={
                      settings?.instagram_client_id_set
                        ? "✓ Meta App ID salvo e ativo no servidor"
                        : "Cole o App ID / Client ID da Meta Developer Console"
                    }
                  />
                  <TextField
                    label="Meta App Secret (Client Secret)"
                    placeholder={settings?.instagram_client_secret_set ? "••••••••••••••••" : "Ex: 4a2b..."}
                    type={showIgSecret ? "text" : "password"}
                    size="small"
                    fullWidth
                    value={igClientSecret}
                    onChange={(e) => setIgClientSecret(e.target.value)}
                    helperText={
                      settings?.instagram_client_secret_set
                        ? "✓ App Secret já configurado e ativo (preencha somente se desejar alterar)"
                        : "Cole o App Secret do aplicativo Meta"
                    }
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => setShowIgSecret(!showIgSecret)}>
                            {showIgSecret ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    {(settings?.instagram_client_id_set || settings?.instagram_client_secret_set) && (
                      <Button
                        variant="outlined"
                        color="error"
                        size="small"
                        onClick={handleClearInstagramCreds}
                        disabled={loadingAction === "instagram_clear"}
                      >
                        Remover Credenciais
                      </Button>
                    )}
                    <Button
                      variant="contained"
                      size="small"
                      onClick={handleSaveInstagramCreds}
                      disabled={(!igClientId && !igClientSecret) || loadingAction === "instagram_save"}
                    >
                      Salvar Credenciais
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            </Stack>
          </Collapse>
        </Stack>
      </Card>

      {/* ── CARD 4: KWAI VÍDEOS & SHORTS ── */}
      <Card
        variant="outlined"
        sx={{
          p: 2,
          borderRadius: 2,
          borderColor: kwaiAccounts.length > 0 ? "success.main" : "divider",
          bgcolor: (t) =>
            kwaiAccounts.length > 0
              ? alpha(t.palette.success.main, 0.03)
              : t.palette.background.paper,
        }}
      >
        <Stack spacing={2}>
          <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }} spacing={1.5}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  bgcolor: alpha("#FF7700", 0.12),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#FF7700",
                }}
              >
                <KwaiIcon sx={{ fontSize: 26 }} />
              </Box>
              <Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Kwai Shorts & Vídeos
                  </Typography>
                  {kwaiAccounts.length > 0 ? (
                    <Chip
                      icon={<CheckCircleIcon sx={{ fontSize: "16px !important" }} />}
                      label={`Conectado (${kwaiAccounts.length} conta(s))`}
                      color="success"
                      size="small"
                      sx={{ fontWeight: 600, height: 24 }}
                    />
                  ) : (
                    <Chip label="Não conectado" size="small" variant="outlined" sx={{ height: 24 }} />
                  )}
                </Stack>
                <Typography variant="caption" sx={{ color: "text.secondary" }}>
                  {kwaiAccounts.length > 0
                    ? `${kwaiAccounts.length} conta(s) do Kwai cadastrada(s) para publicação e fila de agendamento`
                    : "Conecte seus perfis do Kwai para agendamento automático na PublishQueue"}
                </Typography>
              </Box>
            </Stack>

            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                onClick={() => setOpenKwaiModal(true)}
                sx={{
                  bgcolor: "#FF7700",
                  "&:hover": { bgcolor: "#E06600" },
                  fontWeight: 600,
                  color: "#ffffff",
                }}
              >
                + Adicionar Conta Kwai
              </Button>
            </Stack>
          </Stack>

          {/* Lista de Contas Kwai */}
          {kwaiAccounts.length > 0 && (
            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: (t) => alpha(t.palette.background.default, 0.6), border: 1, borderColor: "divider" }}>
              <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5, display: "block", mb: 1 }}>
                Contas do Kwai Vinculadas ({kwaiAccounts.length})
              </Typography>
              <Stack spacing={1}>
                {kwaiAccounts.map((acc) => (
                  <Stack
                    key={acc.id}
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ p: 1.25, borderRadius: 1, bgcolor: "background.paper", border: 1, borderColor: "divider" }}
                  >
                    <Stack direction="row" spacing={1.5} alignItems="center">
                      <Avatar src={acc.avatar_url} sx={{ width: 32, height: 32, bgcolor: alpha("#FF7700", 0.15), color: "#FF7700", fontSize: "0.85rem", fontWeight: 700 }}>
                        {acc.account_name?.charAt(0) || "K"}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {acc.account_name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: "text.secondary", fontFamily: "monospace" }}>
                          {acc.account_id || "@kwai_usuario"}
                        </Typography>
                      </Box>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip label="Ativo" size="small" color="success" variant="outlined" sx={{ height: 22, fontSize: "0.75rem" }} />
                      <Tooltip title="Desconectar esta conta">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleDeleteAccount(acc.id, acc.account_name)}
                          disabled={loadingAction === `del_${acc.id}`}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            </Box>
          )}
        </Stack>
      </Card>

      {/* Modal / Dialog para Adicionar Conta Kwai */}
      <Dialog open={openKwaiModal} onClose={() => setOpenKwaiModal(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Adicionar Conta Kwai</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Cadastre o canal/perfil do Kwai para vinculá-lo aos Canais Temáticos e à Fila de Postagem.
          </Typography>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Nome do Canal ou Perfil"
              placeholder="Ex: Cortes Rápidos Kwai"
              size="small"
              fullWidth
              value={kwaiName}
              onChange={(e) => setKwaiName(e.target.value)}
              required
            />
            <TextField
              label="ID de Usuário ou @Handle"
              placeholder="Ex: @cortes_rapidos ou ID numérico"
              size="small"
              fullWidth
              value={kwaiId}
              onChange={(e) => setKwaiId(e.target.value)}
            />
            <TextField
              label="Webhook URL / Token de Envio (Opcional)"
              placeholder="Ex: https://webhook.kwai... ou token"
              size="small"
              fullWidth
              value={kwaiWebhook}
              onChange={(e) => setKwaiWebhook(e.target.value)}
              helperText="Utilizado para disparo automático ou notificações de postagem"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenKwaiModal(false)} color="inherit">
            Cancelar
          </Button>
          <Button
            onClick={handleSaveKwaiAccount}
            variant="contained"
            disabled={!kwaiName.trim() || savingKwai}
            sx={{ bgcolor: "#FF7700", "&:hover": { bgcolor: "#E06600" }, fontWeight: 600 }}
          >
            {savingKwai ? "Salvando..." : "Vincular Conta"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}
