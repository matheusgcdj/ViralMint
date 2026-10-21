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
  const [confirmRemove, setConfirmRemove] = useState(false)

  // When the parent's keyIsSet flips (e.g. another tab cleared the key),
  // jump back to edit mode so the form is shown. Don't yank the user OUT of
  // edit mode if a save just landed — handleSave() owns that transition.
  useEffect(() => {
    if (!keyIsSet) setEditing(true)
  }, [keyIsSet])

  const handleSave = async () => {
    const value = apiKey.trim()
    if (!value) {
      showSnackbar("Cole sua chave de API primeiro", "warning")
      return
    }
    setSaving(true)
    try {
      await updateSettings({ [service.settingsKey]: value })
      setApiKey("")
      setEditing(false)
      showSnackbar(`Chave da ${service.label} salva`, "success")
    } catch (e) {
      // updateSettings already shows a snackbar on error
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    setConfirmRemove(false)
    setSaving(true)
    try {
      await updateSettings({ [service.settingsKey]: "" })
      setApiKey("")
      setEditing(true)
      showSnackbar(`Chave da ${service.label} removida — utilizando configuração do ambiente (.env)`, "info")
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
                label="chave configurada"
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
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<EditIcon />}
            onClick={() => { setEditing(true); setApiKey("") }}
            disabled={saving}
          >
            Alterar
          </Button>
          <Button
            variant="outlined"
            color="error"
            size="small"
            startIcon={<DeleteIcon />}
            onClick={() => setConfirmRemove(true)}
            disabled={saving}
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
            disabled={saving}
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
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
            >
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            {keyIsSet && (
              <Button
                variant="outlined"
                size="small"
                onClick={() => { setEditing(false); setApiKey("") }}
                disabled={saving}
              >
                Cancelar
              </Button>
            )}
          </Stack>
        </Stack>
      )}

      <Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Remover chave da {service.label}?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            Isso remove a chave criptografada do banco de dados local. O ViralMint utilizará a chave correspondente configurada no arquivo <code>.env</code> (se houver).
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(false)}>Cancelar</Button>
          <Button color="error" variant="contained" onClick={handleRemove}>
            Remover chave
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
