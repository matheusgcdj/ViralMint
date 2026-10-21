import { useState } from "react"
import { Typography, Menu, MenuItem, ListItemText, ListItemIcon } from "@mui/material"
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh"
import PhotoLibraryIcon from "@mui/icons-material/PhotoLibrary"
import http from "../../api/http"
import useAppStore from "../../store/appStore"

export default function CreateModeMenu({ anchorEl, onClose, sourceId, navigate }) {
  const showSnackbar = useAppStore((s) => s.showSnackbar)
  const settings = useAppStore((s) => s.settings)
  const [quickLoading, setQuickLoading] = useState(false)

  const handleQuickGenerate = async () => {
    onClose()
    setQuickLoading(true)
    try {
      await http.post(`/api/downloaded/${sourceId}/generate`, {
        aspect_ratio: "9:16",
        tts_provider: settings?.tts_provider || undefined,
        caption_enabled: true,
        caption_style: settings?.caption_style || "viral",
        music_enabled: true,
        music_genre: "lofi",
      })
      showSnackbar("Geração de Vídeo Inteligente iniciada! Acompanhe na aba Gerados.", "success")
    } catch (e) {
      showSnackbar(e.response?.data?.detail || `Falha na geração rápida: ${e.message}`, "error")
    } finally {
      setQuickLoading(false)
    }
  }

  return (
    <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={onClose}>
      <MenuItem onClick={handleQuickGenerate} disabled={quickLoading}
        sx={{ borderBottom: 1, borderColor: "divider", mb: 0.5 }}>
        <ListItemIcon><AutoFixHighIcon fontSize="small" color="primary" /></ListItemIcon>
        <ListItemText
          primary={quickLoading ? "Iniciando..." : "Vídeo Inteligente Rápido"}
          secondary="1 clique: vídeo de banco + voz configurada + legendas virais"
          primaryTypographyProps={{ fontWeight: 700, color: "primary.main" }}
          secondaryTypographyProps={{ fontSize: "0.7rem" }}
        />
      </MenuItem>
      <Typography variant="caption" sx={{ px: 2, py: 0.5, color: "text.disabled", display: "block" }}>
        Ou personalize no editor:
      </Typography>
      <MenuItem onClick={() => { onClose(); navigate(`/stock?source=${sourceId}`) }}>
        <ListItemIcon><PhotoLibraryIcon fontSize="small" /></ListItemIcon>
        <ListItemText>Smart Video</ListItemText>
      </MenuItem>
    </Menu>
  )
}
