import { useState, useEffect } from "react"
import {
  Box, Stack, Typography, Alert, TextField, Button, IconButton, InputAdornment,
  Chip, Dialog, DialogTitle, DialogContent, DialogActions, Link,
} from "@mui/material"
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined"
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined"
import SaveIcon from "@mui/icons-material/SaveOutlined"
import EditIcon from "@mui/icons-material/EditOutlined"
import DeleteIcon from "@mui/icons-material/DeleteOutlineOutlined"
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline"
import YouTubeIcon from "@mui/icons-material/YouTube"
import ImageSearchIcon from "@mui/icons-material/ImageSearchOutlined"
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibraryOutlined"
import GraphicEqIcon from "@mui/icons-material/GraphicEqOutlined"
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOverOutlined"
import CookieIcon from "@mui/icons-material/Cookie"
import UploadFileIcon from "@mui/icons-material/UploadFile"
import PlayArrowIcon from "@mui/icons-material/PlayArrowOutlined"
import http from "../../api/http"
import useAppStore from "../../store/appStore"

/**
 * Generic per-service BYOK key card. Drop more entries into SERVICES below to
 * add Pexels / TikHub / etc. — the row keeps its own form state.
 */
const SERVICES = [
  {
    id: "youtube",
    label: "YouTube Data API",
    description: "Alimenta o scout do YouTube, leitor de canais e análise de comentários",
    icon: <YouTubeIcon sx={{ color: "#FF0000", fontSize: 28 }} />,
    settingsKey: "youtube_api_key",      // POST /api/settings field
    setFlag: "youtube_api_key_set",       // GET response flag (masked)
    placeholder: "AIzaSy...",
    docsHref: "https://console.cloud.google.com/apis/credentials",
    docsHint: "Obtenha uma chave gratuita no Google Cloud Console → Credenciais → Criar chave de API (10.000 unidades/dia grátis)",
  },
  {
    id: "youtube_cookies",
    label: "Cookies de Sessão do YouTube (Anti-Bot)",
    description: "Arquivo cookies.txt para autenticar downloads e contornar a exigência de 'sign-in to verify you\'re not a bot' no YouTube",
    icon: <CookieIcon sx={{ color: "#E53E3E", fontSize: 28 }} />,
    settingsKey: "youtube_cookies",
    setFlag: "youtube_cookies_set",
    placeholder: "Cole o conteúdo do arquivo cookies.txt (formato Netscape) ou clique em Carregar cookies.txt abaixo",
    docsHref: "https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp",
    docsHint: "Exporte com uma extensão como 'Get cookies.txt LOCALLY' no Chrome/Firefox logado no YouTube e envie ou cole aqui",
    multiline: true,
    allowFileUpload: true,
    allowTest: true,
  },
  {
    id: "pexels",
    label: "Pexels API",
    description: "Imagens e vídeos de stock gratuitos e em alta qualidade para composições",
    icon: <ImageSearchIcon sx={{ color: "#05A081", fontSize: 28 }} />,
    settingsKey: "pexels_api_key",
    setFlag: "pexels_api_key_set",
    placeholder: "ey...",
    docsHref: "https://www.pexels.com/api/new/",
    docsHint: "Crie uma conta gratuita no Pexels e gere sua chave de API (200 requisições/hora grátis)",
  },
  {
    id: "pixabay",
    label: "Pixabay API",
    description: "Banco de imagens, vídeos e ilustrações livres de royalties",
    icon: <PhotoLibraryIcon sx={{ color: "#2EC66D", fontSize: 28 }} />,
    settingsKey: "pixabay_api_key",
    setFlag: "pixabay_api_key_set",
    placeholder: "12345678-abcdef...",
    docsHref: "https://pixabay.com/api/docs/",
    docsHint: "Crie uma conta gratuita no Pixabay → API docs → copie sua chave (100 req/min grátis)",
  },
  {
    id: "groq",
    label: "Groq Whisper (STT)",
    description: "Transcrição ultrarrápida em nuvem — Whisper Large v3 via hardware dedicado da Groq",
    icon: <GraphicEqIcon sx={{ color: "#F55036", fontSize: 28 }} />,
    settingsKey: "groq_api_key",
    setFlag: "groq_api_key_set",
    placeholder: "gsk_...",
    docsHref: "https://console.groq.com/keys",
    docsHint: "Crie uma conta na Groq → API Keys → gere uma chave (tier gratuito generoso para Whisper)",
  },
  {
    id: "google_tts",
    label: "Google TTS (Cloud & AI Studio)",
    description: "Vozes neurais Google Cloud e Google AI Studio — suporta chave única ou pool multi-contas com rotação automática",
    icon: <RecordVoiceOverIcon sx={{ color: "#4285F4", fontSize: 28 }} />,
    settingsKey: "google_tts_api_keys",
    setFlag: "google_tts_api_key_set",
    placeholder: "Cole uma ou mais chaves (AIzaSy...) separadas por vírgula ou uma por linha",
    docsHref: "https://aistudio.google.com/app/apikey",
    docsHint: "Compatível com Google Cloud Console (Text-to-Speech) e Google AI Studio (aistudio.google.com). Suporta rotação entre múltiplas contas",
    multiline: true,
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs (TTS Pool)",
    description: "Vozes neurais de alta expressividade — suporta chave única ou pool multi-contas com failover automático e cooldown",
    icon: <RecordVoiceOverIcon sx={{ color: "#6366F1", fontSize: 28 }} />,
    settingsKey: "elevenlabs_api_keys",
    setFlag: "elevenlabs_api_key_set",
    placeholder: "Cole uma ou mais chaves (xi-api-key...) separadas por vírgula ou uma por linha",
    docsHref: "https://elevenlabs.io/app/settings/api-keys",
    docsHint: "ElevenLabs → Profile → API Keys. Suporta chave única ou múltiplas chaves (uma por linha ou separadas por vírgula) para rotacionar entre as contas",
    multiline: true,
  },
]

function ServiceKeyRow({ service, settings, updateSettings }) {
  const showSnackbar = useAppStore((s) => s.showSnackbar)
  const keyIsSet = !!settings?.[service.setFlag]

  const [editing, setEditing] = useState(!keyIsSet)
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  // When the parent's keyIsSet flips (e.g. another tab cleared the key),
  // jump back to edit mode so the form is shown. Don't yank the user OUT of
  // edit mode if a save just landed — handleSave() owns that transition.
  useEffect(() => {
    setEditing(!keyIsSet)
  }, [keyIsSet])

  const handleSave = async () => {
    const value = apiKey.trim()
    if (!value) {
      showSnackbar("Cole ou carregue a configuração primeiro", "warning")
      return
    }
    setSaving(true)
    try {
      await updateSettings({ [service.settingsKey]: value })
      setApiKey("")
      setEditing(false)
      showSnackbar(`${service.label} salvo com sucesso`, "success")
    } catch (e) {
      // updateSettings already shows a snackbar on error
    } finally {
      setSaving(false)
    }
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result
      if (typeof text === "string" && text.trim()) {
        setApiKey(text.trim())
        showSnackbar(`Arquivo ${file.name} carregado (${(file.size / 1024).toFixed(1)} KB). Clique em Salvar para aplicar.`, "info")
      }
    }
    reader.readAsText(file)
  }

  const handleTest = async () => {
    setTesting(true)
    try {
      const payload = {
        platform: service.id === "youtube_cookies" ? "youtube" : service.id,
        cookie: apiKey.trim() || "__check_saved__",
      }
      const res = await http.post("/api/settings/test-cookie", payload)
      if (res.data?.ok) {
        showSnackbar(`Cookies do YouTube válidos! Conexão autenticada estabelecida (${res.data.title || "OK"})`, "success")
      } else {
        showSnackbar(`Falha no teste: ${res.data?.error || "Cookie inválido"}`, "error")
      }
    } catch (e) {
      showSnackbar(`Erro ao testar: ${e.response?.data?.detail || e.message}`, "error")
    } finally {
      setTesting(false)
    }
  }

  const handleRemove = async () => {
    setConfirmRemove(false)
    setSaving(true)
    try {
      await updateSettings({ [service.settingsKey]: "" })
      setApiKey("")
      setEditing(true)
      showSnackbar(`${service.label} removido — utilizando configuração padrão ou do ambiente (.env)`, "info")
    } catch (e) {
      // handled in updateSettings
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box
      sx={{
        p: 2,
        border: 1,
        borderColor: "divider",
        borderRadius: 2,
        "&:not(:last-of-type)": { mb: 2 },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1.5 }}>
        {service.icon}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {service.label}
            </Typography>
            {keyIsSet && (
              <Chip
                size="small"
                color="success"
                variant="outlined"
                icon={<CheckCircleIcon fontSize="small" />}
                label="configurado"
                sx={{ fontWeight: 500 }}
              />
            )}
          </Stack>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {service.description}
          </Typography>
        </Box>
      </Stack>

      {!editing && keyIsSet ? (
        <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined"
            size="small"
            startIcon={<EditIcon />}
            onClick={() => { setEditing(true); setApiKey("") }}
            disabled={saving || testing}
          >
            Alterar
          </Button>
          {service.allowTest && (
            <Button
              variant="outlined"
              size="small"
              color="info"
              startIcon={<PlayArrowIcon />}
              onClick={handleTest}
              disabled={saving || testing}
            >
              {testing ? "Testando…" : "Testar Conexão"}
            </Button>
          )}
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<DeleteIcon />}
            onClick={() => setConfirmRemove(true)}
            disabled={saving || testing}
          >
            Remover
          </Button>
        </Stack>
      ) : (
        <Stack spacing={1.5}>
          <TextField
            type={showKey ? "text" : "password"}
            size="small"
            fullWidth
            multiline={!!service.multiline}
            minRows={service.multiline ? 2 : undefined}
            maxRows={service.multiline ? 4 : undefined}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={service.placeholder}
            helperText={
              <>
                {service.docsHint}{" "}
                <Link href={service.docsHref} target="_blank" rel="noreferrer">
                  abrir documentação
                </Link>
              </>
            }
            disabled={saving || testing}
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
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button
              variant="contained"
              size="small"
              startIcon={<SaveIcon />}
              onClick={handleSave}
              disabled={saving || testing || !apiKey.trim()}
            >
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            {service.allowFileUpload && (
              <Button
                variant="outlined"
                size="small"
                component="label"
                startIcon={<UploadFileIcon />}
                disabled={saving || testing}
              >
                Carregar cookies.txt
                <input type="file" accept=".txt" hidden onChange={handleFileUpload} />
              </Button>
            )}
            {service.allowTest && apiKey.trim() && (
              <Button
                variant="outlined"
                size="small"
                color="info"
                startIcon={<PlayArrowIcon />}
                onClick={handleTest}
                disabled={saving || testing}
              >
                {testing ? "Testando…" : "Testar"}
              </Button>
            )}
            {keyIsSet && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => { setEditing(false); setApiKey("") }}
                disabled={saving || testing}
              >
                Cancelar
              </Button>
            )}
          </Stack>
        </Stack>
      )}

      <Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Remover {service.label}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Isso remove a configuração criptografada do banco de dados local. O ViralMint utilizará a configuração correspondente no arquivo <code>.env</code> ou padrão (se houver).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleRemove}>
            Remover
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default function ServiceKeysSection({ settings, updateSettings }) {
  return (
    <Stack spacing={0}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Chaves de API por serviço, criptografadas (AES-256) antes do armazenamento. Elas têm prioridade sobre as chaves definidas no arquivo <code>.env</code> em tempo de execução.
      </Typography>
      {SERVICES.map((service) => (
        <ServiceKeyRow
          key={service.id}
          service={service}
          settings={settings}
          updateSettings={updateSettings}
        />
      ))}
    </Stack>
  )
}
