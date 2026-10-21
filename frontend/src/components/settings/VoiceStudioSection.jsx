// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import {
  Box, Stack, Typography, Button, Chip, Alert,
  CircularProgress, LinearProgress, alpha, useTheme,
  Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions,
} from "@mui/material"
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOver"
import PlayArrowIcon from "@mui/icons-material/PlayArrowOutlined"
import CheckCircleIcon from "@mui/icons-material/CheckCircle"
import DownloadIcon from "@mui/icons-material/DownloadOutlined"
import DeleteIcon from "@mui/icons-material/DeleteOutlineOutlined"
import OpenInNewIcon from "@mui/icons-material/OpenInNew"
import http from "../../api/http"
import useAppStore from "../../store/appStore"

export default function VoiceStudioSection() {
  const theme = useTheme()
  const navigate = useNavigate()
  const showSnackbar = useAppStore((s) => s.showSnackbar)

  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uninstallConfirm, setUninstallConfirm] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const pollRef = useRef(null)

  const fetchStatus = async () => {
    try {
      const res = await http.get("/api/settings/voice-studio/status")
      setStatus(res.data)
      return res.data
    } catch (e) {
      console.error("Falha ao buscar status do Voice Studio:", e)
      return null
    }
  }

  const startPoll = () => {
    if (pollRef.current) return
    let nullStreak = 0
    const tick = async () => {
      const data = await fetchStatus()
      if (data == null) {
        nullStreak += 1
        if (nullStreak <= 5) {
          pollRef.current = setTimeout(tick, 2000)
        } else {
          pollRef.current = null
        }
        return
      }
      nullStreak = 0
      if (data.installing) {
        pollRef.current = setTimeout(tick, 2000)
      } else {
        pollRef.current = null
        if (data.installed && !data.error) {
          showSnackbar("Voice Studio instalado com sucesso!", "success")
        } else if (data.error) {
          showSnackbar(`Erro ao instalar Voice Studio: ${data.error}`, "error")
        }
      }
    }
    pollRef.current = setTimeout(tick, 1500)
  }

  useEffect(() => {
    fetchStatus().then((data) => {
      if (data?.installing) startPoll()
    })
    return () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current)
        pollRef.current = null
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const install = async () => {
    setBusy(true)
    setTestResult(null)
    try {
      const res = await http.post("/api/settings/voice-studio/install")
      if (res.data?.ok) {
        showSnackbar(
          `Instalando Voice Studio (~${status?.approx_download_mb ?? 420} MB de modelos neurais pt-BR)...`,
          "info"
        )
        await fetchStatus()
        startPoll()
      } else {
        showSnackbar(res.data?.error || "Não foi possível iniciar a instalação", "error")
      }
    } catch (e) {
      showSnackbar(`Falha na instalação: ${e.message}`, "error")
    } finally {
      setBusy(false)
    }
  }

  const uninstall = async () => {
    setUninstallConfirm(false)
    setBusy(true)
    try {
      await http.post("/api/settings/voice-studio/uninstall")
      setTestResult(null)
      await fetchStatus()
      showSnackbar("Voice Studio removido com sucesso.", "success")
    } catch (e) {
      showSnackbar(`Erro ao desinstalar: ${e.message}`, "error")
    } finally {
      setBusy(false)
    }
  }

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await http.post("/api/settings/voice-studio/test")
      setTestResult(res.data)
    } catch (e) {
      setTestResult({ ok: false, detail: e.message })
    } finally {
      setTesting(false)
    }
  }

  if (!status) {
    return (
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 1 }}>
        <CircularProgress size={16} />
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          Carregando status do Voice Studio...
        </Typography>
      </Stack>
    )
  }

  const { installed, installing, running, error } = status

  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: (t) => alpha(t.palette.background.paper, 0.5),
        mt: 2,
      }}
    >
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mb: 1.5 }}>
        <RecordVoiceOverIcon sx={{ fontSize: 20, color: "primary.main" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Voice Studio (Porta 3900)
        </Typography>

        {installed && (
          <Chip
            size="small"
            color="success"
            variant="outlined"
            icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
            label="Modelos Instalados"
          />
        )}
        {running ? (
          <Chip size="small" color="primary" label="Daemon Ativo (Porta 3900)" />
        ) : (
          <Chip size="small" variant="outlined" label="Fallback Neural Pronto" />
        )}
        {installing && <Chip size="small" color="info" variant="outlined" label="Instalando..." />}

        <Box sx={{ flexGrow: 1 }} />

        {!installed && !installing && (
          <Button
            size="small"
            variant="contained"
            startIcon={<DownloadIcon sx={{ fontSize: 16 }} />}
            disabled={busy}
            onClick={install}
          >
            {busy ? "Iniciando..." : "Instalar Modelos"}
          </Button>
        )}

        {installed && (
          <>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PlayArrowIcon sx={{ fontSize: 16 }} />}
              disabled={testing || busy}
              onClick={runTest}
            >
              {testing ? "Sintetizando..." : "Teste de Narração"}
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="primary"
              endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
              onClick={() => navigate("/voice-studio")}
            >
              Estúdio Completo
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon sx={{ fontSize: 16 }} />}
              disabled={busy}
              onClick={() => setUninstallConfirm(true)}
            >
              Remover
            </Button>
          </>
        )}
      </Stack>

      <Typography variant="caption" sx={{ display: "block", color: "text.secondary", fontSize: "0.78rem", lineHeight: 1.5, mb: 1 }}>
        Motor de síntese neural e clonagem de voz do ViralMint. Conecta-se diretamente ao microserviço na porta 3900 com vozes ultrarrealistas em português brasileiro (Marcos Podcast, Camila Curiosidades, Lucas Mistério) com ducking inteligente de trilha sonora e latência inferior a 250ms.
      </Typography>

      {installing && (
        <Box sx={{ mt: 1, mb: 1 }}>
          <Typography variant="caption" sx={{ color: "primary.main", fontWeight: 600 }}>
            {status.current_step || "Instalando modelos neurais..."}
          </Typography>
          <LinearProgress
            variant={status.progress_pct ? "determinate" : "indeterminate"}
            value={status.progress_pct || 0}
            sx={{ mt: 0.5, height: 6, borderRadius: 3 }}
          />
        </Box>
      )}

      {error && !installing && (
        <Alert severity="error" sx={{ mt: 1, fontSize: "0.78rem", py: 0.25 }}>
          {error}
        </Alert>
      )}

      {testResult && (
        <Alert
          severity={testResult.ok ? "success" : "error"}
          sx={{ mt: 1.5, fontSize: "0.82rem", alignItems: "center" }}
        >
          {testResult.ok ? (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {testResult.message}
              </Typography>
              <Typography variant="caption" sx={{ color: "text.secondary", display: "block" }}>
                Latência: {testResult.latency_ms}ms · Tamanho: {testResult.output_size_kb} KB
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2">{testResult.detail || testResult.error}</Typography>
          )}
        </Alert>
      )}

      <Dialog open={uninstallConfirm} onClose={() => setUninstallConfirm(false)}>
        <DialogTitle>Remover modelos do Voice Studio?</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ fontSize: "0.88rem" }}>
            Isso liberará aproximadamente {status.disk_size_mb || status.approx_download_mb} MB no disco. O ViralMint continuará sintetizando narrações através do fallback neural gratuito Edge TTS.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUninstallConfirm(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={uninstall} color="error" variant="contained" disabled={busy}>
            Confirmar Remoção
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
