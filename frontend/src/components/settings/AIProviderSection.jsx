import { useState, useEffect, useCallback } from "react"
import {
  Box, Stack, Typography, Alert, TextField, Button, FormControl, InputLabel,
  Select, MenuItem, IconButton, InputAdornment, Chip, Dialog, DialogTitle,
  DialogContent, DialogActions, CircularProgress, Autocomplete,
} from "@mui/material"
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined"
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined"
import SaveIcon from "@mui/icons-material/SaveOutlined"
import EditIcon from "@mui/icons-material/EditOutlined"
import DeleteIcon from "@mui/icons-material/DeleteOutlineOutlined"
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutline"
import RefreshIcon from "@mui/icons-material/RefreshOutlined"
import http from "../../api/http"
import useAppStore from "../../store/appStore"

const PROVIDER_LABEL = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  openrouter: "OpenRouter (Claude / GPT / Gemini / Llama)",
  openai_compatible: "Compatível com OpenAI (Ollama, LM Studio, vLLM, …)",
}

// Any server that speaks OpenAI's /chat/completions, at a URL the user gives.
const COMPATIBLE = "openai_compatible"

const KEY_PLACEHOLDER = {
  anthropic: "sk-ant-...",
  openai: "sk-...",
  openrouter: "sk-or-...",
  openai_compatible: "Opcional — servidores locais geralmente não necessitam",
}

const KEY_HINT = {
  anthropic: "Obtenha a sua em console.anthropic.com → API Keys",
  openai: "Obtenha a sua em platform.openai.com → API Keys",
  openrouter: "Uma chave, todos os modelos — obtenha em openrouter.ai/keys",
  openai_compatible: "Necessário apenas se o servidor exigir autenticação (Groq, DeepSeek, gateways…)",
}

export default function AIProviderSection({ settings, updateSettings }) {
  const showSnackbar = useAppStore((s) => s.showSnackbar)

  const [provider, setProvider] = useState(settings?.ai_provider || "openai")
  const [model, setModel] = useState(settings?.ai_model || "")
  const [baseUrl, setBaseUrl] = useState(settings?.ai_base_url || "")
  const [apiKey, setApiKey] = useState("")
  const [showKey, setShowKey] = useState(false)
  const [registry, setRegistry] = useState({})
  const [saving, setSaving] = useState(false)
  const isConfigured = (s) =>
    !!s?.ai_api_key_set || (s?.ai_provider === COMPATIBLE && !!s?.ai_base_url)
  const [editing, setEditing] = useState(!isConfigured(settings))
  const [confirmRemove, setConfirmRemove] = useState(false)

  // ── Compatible provider model auto-discovery ───────────────────────────────
  const [compatModels, setCompatModels] = useState([])
  const [compatLoading, setCompatLoading] = useState(false)
  const [compatError, setCompatError] = useState("")

  const fetchCompatibleModels = useCallback(async (url, key) => {
    const trimmedUrl = (url || "").trim()
    if (!trimmedUrl) {
      setCompatModels([])
      setCompatError("")
      return
    }
    setCompatLoading(true)
    setCompatError("")
    try {
      const params = new URLSearchParams()
      params.set("base_url", trimmedUrl)
      if (key) params.set("api_key", key)
      const { data } = await http.get(`/api/config/compatible_models?${params}`)
      const models = (data?.models || []).map((m) => (typeof m === "string" ? m : m.id))
      setCompatModels(models)
      if (models.length === 0 && data?.error) {
        setCompatError(data.error)
      }
    } catch (e) {
      setCompatModels([])
      setCompatError("Falha ao obter modelos do servidor")
    } finally {
      setCompatLoading(false)
    }
  }, [])

  // Auto-fetch models when base URL changes (debounced)
  useEffect(() => {
    if (provider !== COMPATIBLE) return
    const trimmed = (baseUrl || "").trim()
    if (!trimmed) {
      setCompatModels([])
      return
    }
    const timer = setTimeout(() => fetchCompatibleModels(trimmed, apiKey), 600)
    return () => clearTimeout(timer)
  }, [baseUrl, provider]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync local state when settings change (e.g. after save).
  // If no key is set (cleared elsewhere or never set), force into edit mode
  // so the form is visible. handleSave / handleRemove own toggling out.
  useEffect(() => {
    if (settings) {
      setProvider(settings.ai_provider || "openai")
      setModel(settings.ai_model || "")
      setBaseUrl(settings.ai_base_url || "")
      setEditing(!isConfigured(settings))
    }
  }, [settings?.ai_provider, settings?.ai_model, settings?.ai_api_key_set, settings?.ai_base_url])

  // Fetch model registry once
  useEffect(() => {
    http.get("/api/config/model_registry")
      .then(({ data }) => setRegistry(data?.value || {}))
      .catch(() => {})
  }, [])

  const availableModels = registry[provider]?.models || []
  const defaultModel = registry[provider]?.default_model || ""
  const effectiveModel = model || defaultModel
  const compatible = provider === COMPATIBLE

  const handleSave = async () => {
    const hasNewKey = apiKey.trim().length > 0
    if (compatible) {
      if (!baseUrl.trim() || !model.trim()) {
        showSnackbar("Enter the server's base URL and a model name", "warning")
        return
      }
    } else if (!hasNewKey && !settings?.ai_api_key_set) {
      showSnackbar("Cole sua chave de API primeiro", "warning")
      return
    }
    setSaving(true)
    try {
      // Always send the model that's actually displayed in the dropdown.
      // If the user switched providers, `model` was reset to "" and `effectiveModel`
      // resolves to the new provider's default — that's what they saw and what we save.
      const updates = {
        ai_provider: provider,
        ai_model: (compatible ? model.trim() : effectiveModel) || "",  // empty string clears stale model
      }
      if (compatible) updates.ai_base_url = baseUrl.trim()
      if (hasNewKey) {
        updates.ai_api_key = apiKey.trim()
      }
      await updateSettings(updates)
      setApiKey("")
      setEditing(false)
      showSnackbar(hasNewKey ? "Chave de API salva" : compatible ? "Servidor de IA salvo" : "Provedor atualizado", "success")
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
      await updateSettings(
        settings?.ai_provider === COMPATIBLE
          ? { ai_api_key: "", ai_base_url: "" }
          : { ai_api_key: "" },
      )
      setApiKey("")
      setEditing(true)
      showSnackbar("Provedor removido — utilizando configuração padrão do ambiente (.env)", "info")
    } catch (e) {
      // handled in updateSettings
    } finally {
      setSaving(false)
    }
  }

  const keyIsSet = !!settings?.ai_api_key_set

  // ── Connected state: key already configured, not editing ────────────────────
  if (!editing && isConfigured(settings)) {
    return (
      <Stack spacing={2}>
        <Alert
          severity="success"
          variant="outlined"
          icon={<CheckCircleIcon fontSize="small" />}
        >
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {settings.ai_provider === COMPATIBLE ? "Servidor de IA próprio configurado" : "Chave de API pessoal configurada"}
            </Typography>
            <Chip
              size="small"
              label={PROVIDER_LABEL[settings.ai_provider] || settings.ai_provider}
              color="primary"
              variant="outlined"
              sx={{ fontWeight: 500 }}
            />
            {settings.ai_model && (
              <Chip
                size="small"
                label={`model: ${settings.ai_model}`}
                variant="outlined"
              />
            )}
            {settings.ai_provider === COMPATIBLE && settings.ai_base_url && (
              <Chip
                size="small"
                label={settings.ai_base_url}
                variant="outlined"
                sx={{ maxWidth: "100%" }}
              />
            )}
          </Stack>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mt: 0.75 }}>
            Armazenada com criptografia neste servidor. Enviada apenas ao provedor ao conversar ou gerar conteúdo.
          </Typography>
        </Alert>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="contained"
            startIcon={<EditIcon />}
            onClick={() => { setEditing(true); setApiKey("") }}
            disabled={saving}
          >
            Atualizar
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setConfirmRemove(true)}
            disabled={saving}
          >
            Remover
          </Button>
        </Stack>

        <Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)} maxWidth="xs" fullWidth>
          <DialogTitle>{settings.ai_provider === COMPATIBLE ? "Remover este servidor?" : "Remover chave de API?"}</DialogTitle>
          <DialogContent>
            <Typography variant="body2">
              Isso removerá a {settings.ai_provider === COMPATIBLE ? "URL do servidor e a" : "chave criptografada"} do banco de dados local. O ViralMint utilizará as variáveis configuradas no ambiente (.env). Se nenhuma estiver definida, os recursos de IA ficarão pausados até uma nova configuração.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setConfirmRemove(false)}>Cancelar</Button>
            <Button color="error" variant="contained" onClick={handleRemove}>
              {settings.ai_provider === COMPATIBLE ? "Remover servidor" : "Remover chave"}
            </Button>
          </DialogActions>
        </Dialog>
      </Stack>
    )
  }

  // ── Editing state: form for provider/model/key ──────────────────────────────
  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Conecte sua própria chave da Anthropic, OpenAI ou OpenRouter — ou aponte o ViralMint para qualquer servidor compatível com OpenAI (Ollama, LM Studio, vLLM, DeepSeek, Groq…). Suas chaves são criptografadas (AES-256) e enviadas exclusivamente aos provedores requisitados.
      </Typography>

      <FormControl size="small" fullWidth>
        <InputLabel>Provedor</InputLabel>
        <Select
          value={provider}
          label="Provedor"
          onChange={(e) => { setProvider(e.target.value); setModel("") }}
          disabled={saving}
        >
          <MenuItem value="anthropic">Anthropic (Claude)</MenuItem>
          <MenuItem value="openai">OpenAI (GPT)</MenuItem>
          <MenuItem value="openrouter">OpenRouter (Claude / GPT / Gemini / Llama)</MenuItem>
          <MenuItem value={COMPATIBLE}>{PROVIDER_LABEL[COMPATIBLE]}</MenuItem>
        </Select>
      </FormControl>

      {compatible && (
        <TextField
          label="URL Base"
          size="small"
          fullWidth
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="http://localhost:11434/v1"
          helperText="Endpoint do servidor compatível com a API OpenAI, geralmente terminando em /v1 (Ollama: http://localhost:11434/v1, LM Studio: http://localhost:1234/v1)"
          disabled={saving}
          autoComplete="off"
        />
      )}

      {compatible ? (
        <Stack spacing={1}>
          {compatModels.length > 0 ? (
            <Autocomplete
              freeSolo
              size="small"
              options={compatModels}
              value={model}
              onInputChange={(_, v) => setModel(v)}
              onChange={(_, v) => setModel(v || "")}
              disabled={saving}
              loading={compatLoading}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Modelo"
                  placeholder="Selecione ou digite o nome do modelo"
                  helperText={
                    compatLoading
                      ? "Carregando modelos do servidor…"
                      : `${compatModels.length} modelo(s) encontrado(s) no servidor. Você também pode digitar um nome personalizado.`
                  }
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {compatLoading && <CircularProgress size={18} sx={{ mr: 1 }} />}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          ) : (
            <TextField
              label="Modelo"
              size="small"
              fullWidth
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. qwen3:14b, llama3.3, deepseek-chat"
              helperText={
                compatLoading
                  ? "Carregando modelos do servidor…"
                  : compatError
                    ? `Não foi possível detectar modelos: ${compatError}. Digite o nome do modelo manualmente.`
                    : "Insira a URL Base acima para detectar modelos automaticamente, ou digite o nome exato."
              }
              disabled={saving}
              autoComplete="off"
              InputProps={{
                endAdornment: compatLoading ? (
                  <InputAdornment position="end">
                    <CircularProgress size={18} />
                  </InputAdornment>
                ) : null,
              }}
            />
          )}
          {!compatLoading && baseUrl.trim() && (
            <Button
              size="small"
              variant="text"
              startIcon={<RefreshIcon />}
              onClick={() => fetchCompatibleModels(baseUrl.trim(), apiKey)}
              sx={{ alignSelf: "flex-start" }}
            >
              Atualizar modelos
            </Button>
          )}
        </Stack>
      ) : (
      <FormControl size="small" fullWidth>
        <InputLabel>Modelo</InputLabel>
        <Select
          value={effectiveModel}
          label="Modelo"
          onChange={(e) => setModel(e.target.value)}
          disabled={saving || availableModels.length === 0}
        >
          {availableModels.map((m) => (
            <MenuItem key={m} value={m}>
              {m}
              {m === defaultModel && (
                <Typography component="span" variant="caption" sx={{ ml: 1, color: "text.secondary" }}>
                  (default)
                </Typography>
              )}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      )}

      <TextField
        label={compatible ? "Chave de API (opcional)" : "Chave de API"}
        type={showKey ? "text" : "password"}
        size="small"
        fullWidth
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={keyIsSet ? "(deixe em branco para manter a chave salva)" : KEY_PLACEHOLDER[provider]}
        helperText={KEY_HINT[provider]}
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
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saving || (compatible ? !baseUrl.trim() || !model.trim() : !apiKey.trim() && !keyIsSet)}
        >
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        {isConfigured(settings) && (
          <Button
            variant="outlined"
            onClick={() => { setEditing(false); setApiKey("") }}
            disabled={saving}
          >
            Cancel
          </Button>
        )}
      </Stack>
    </Stack>
  )
}
