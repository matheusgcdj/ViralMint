// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState, useEffect, useRef } from "react"
import {
  Box, Typography, Stack, Chip, IconButton, Button,
  TextField, Tooltip, MenuItem, FormControlLabel, Checkbox, Switch,
  Dialog, DialogTitle, DialogContent, DialogActions, Collapse, Divider,
} from "@mui/material"
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesomeOutlined"
import ContentCutIcon from "@mui/icons-material/ContentCut"
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined"
import TuneIcon from "@mui/icons-material/TuneOutlined"
import ExpandMoreIcon from "@mui/icons-material/ExpandMore"
import SubtitlesOutlinedIcon from "@mui/icons-material/SubtitlesOutlined"
import GraphicEqOutlinedIcon from "@mui/icons-material/GraphicEqOutlined"
import CropPortraitOutlinedIcon from "@mui/icons-material/CropPortraitOutlined"
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined"
import BoltIcon from "@mui/icons-material/BoltOutlined"
import { formatTime } from "./clipFormat"
import { CAPTION_STYLES } from "../tools/captionOptions"
import { clipSettingsPayload } from "./useClipSettings"
import { autoCutEstimate } from "./autoClipCount"
import useAppStore from "../../store/appStore"

/* ── Cortes Automáticos de Clipes ────────────────────────────── */

const WHISPER_QUALITIES = [
  { value: "groq_auto", label: "⚡ Groq Cloud Whisper (Ultra-Rápido)", desc: "~5s via LPU na nuvem" },
  { value: "fast", label: "Local: Rápido (Base)", desc: "~30s por 5min de vídeo" },
  { value: "balanced", label: "Local: Equilibrado (Small)", desc: "~90s por 5min de vídeo" },
  { value: "accurate", label: "Local: Preciso (Medium)", desc: "~3min por 5min de vídeo" },
  { value: "best", label: "Local: Máxima Qualidade (Large-v3)", desc: "~8min por 5min de vídeo" },
]

const CAPTION_STYLE_OPTIONS = CAPTION_STYLES.map((s) => ({ v: s.value, label: s.label }))
const EMOJI_STYLE_OPTIONS = [
  { v: "none", label: "Desativado" },
  { v: "minimal", label: "Mínimo" },
  { v: "moderate", label: "Moderado" },
  { v: "heavy", label: "Intenso" },
]

function SettingRow({ icon, label, sublabel, summary, control, onRowClick, expanded, children, divider }) {
  return (
    <Box sx={{ borderTop: divider ? "1px solid" : "none", borderColor: "divider" }}>
      <Stack
        direction="row" alignItems="center" spacing={1.25}
        onClick={onRowClick}
        sx={{
          px: 1.5, py: 1, minHeight: 44,
          cursor: onRowClick ? "pointer" : "default",
          userSelect: "none",
          "&:hover": onRowClick ? { bgcolor: "action.hover" } : undefined,
          transition: "background-color .12s ease",
        }}
      >
        <Box sx={{ display: "flex", color: "text.secondary", "& svg": { fontSize: 19 } }}>{icon}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.25 }}>{label}</Typography>
          {sublabel && (
            <Typography variant="caption" sx={{ color: "text.secondary", display: "block", lineHeight: 1.3 }}>
              {sublabel}
            </Typography>
          )}
        </Box>
        {summary && (
          <Typography variant="caption" sx={{ color: "text.secondary", flexShrink: 0, fontWeight: 500 }}>
            {summary}
          </Typography>
        )}
        {control}
      </Stack>
      {children != null && (
        <Collapse in={expanded} timeout={180}>
          <Box sx={{ px: 1.5, pb: 1.5, pt: 0.25 }}>{children}</Box>
        </Collapse>
      )}
    </Box>
  )
}

function RowSwitch({ checked }) {
  return <Switch checked={checked} size="small" sx={{ pointerEvents: "none", flexShrink: 0 }} />
}

export default function ExtractDialog({ open, onClose, video, onExtract, settings, onSettings }) {
  const globalSettings = useAppStore((s) => s.settings)
  const groqConfigured = !!globalSettings?.groq_api_key_set || globalSettings?.stt_provider === "groq" || settings?.whisper_backend === "groq"
  const hasSegments = !!video?.has_transcript_segments

  const [ai, setAi] = useState({
    min_duration: null, max_duration: null, max_clips: null,
    user_query: "", target_platform: "", genre: "",
  })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const lastStyle = useRef("viral")

  useEffect(() => {
    setAi({ min_duration: null, max_duration: null, max_clips: null,
            user_query: "", target_platform: "", genre: "" })
    setAdvancedOpen(false)
    setTranscriptOpen(false)
  }, [video?.id])

  if (!video) return null

  const set = (patch) => onSettings(patch)
  const transcribeEnabled = !hasSegments || settings.force_retranscribe
  const captionsOn = settings.caption_style !== "none"
  const durationError = ai.min_duration && ai.max_duration && ai.max_duration - ai.min_duration < 1
  const canSubmit = !durationError

  const estimate = autoCutEstimate({
    durationSeconds: video.duration_seconds,
    requested: ai.max_clips,
    minDurationSeconds: ai.min_duration,
  })

  // Determine current active transcription summary
  const isGroqActive = settings.whisper_backend === "groq" || (settings.whisper_backend === "auto" && groqConfigured)
  const currentEngineSummary = hasSegments && !settings.force_retranscribe
    ? "Em cache · Transcrição dispensada"
    : isGroqActive
      ? "⚡ Groq Cloud Whisper (~5s)"
      : (WHISPER_QUALITIES.find(q => q.value === settings.whisper_quality)?.label || settings.whisper_quality)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <AutoAwesomeIcon color="secondary" /> Cortes Automáticos de Clipes
        <Tooltip title="A IA lê a transcrição, seleciona os momentos mais virais e realiza os cortes diretamente — sem etapa de revisão. Para ver as escolhas na linha do tempo antes de cortar, use Perguntar à IA na mesa de corte." arrow>
          <IconButton size="small" sx={{ ml: "auto", color: "text.secondary" }}>
            <InfoOutlinedIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Tooltip>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ color: "text.secondary", mb: 0.5 }}>
          Vídeo Fonte: <strong>{video.title || "Sem título"}</strong> ({formatTime(video.duration_seconds)})
        </Typography>
        <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 2 }}>
          Corta os clipes assim que você clica no botão — sem etapa de revisão prévia.
        </Typography>

        <Stack spacing={2.5}>
          {/* Duração e quantidade de clipes */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: "block" }}>
              Duração e quantidade de clipes (deixe vazio para automático)
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
              <TextField label="Mín (s)" type="number" size="small" sx={{ width: 90 }}
                value={ai.min_duration || ""}
                error={!!durationError}
                slotProps={{ htmlInput: { min: 10, max: 120 } }}
                onChange={e => setAi(p => ({ ...p, min_duration: parseInt(e.target.value) || null }))} />
              <Typography variant="body2" sx={{ color: "text.secondary" }}>até</Typography>
              <TextField label="Máx (s)" type="number" size="small" sx={{ width: 90 }}
                value={ai.max_duration || ""}
                error={!!durationError}
                slotProps={{ htmlInput: { min: 15, max: 180 } }}
                onChange={e => setAi(p => ({ ...p, max_duration: parseInt(e.target.value) || null }))} />
              <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
              <TextField label="Clipes (máx)" type="number" size="small" sx={{ width: 110 }}
                value={ai.max_clips || ""}
                slotProps={{ htmlInput: { min: 1, max: 99 } }}
                onChange={e => setAi(p => ({ ...p, max_clips: parseInt(e.target.value) || null }))} />
            </Stack>
            <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block" }}>
              {ai.max_clips
                ? `Até ${estimate.clips} ${estimate.clips === 1 ? "clipe" : "clipes"}, 15–60s cada — menos se o vídeo tiver menos material de qualidade.`
                : video.duration_seconds
                  ? `Vazio significa ~1 clipe a cada 30s: até ${estimate.clips} para este vídeo de ${Math.round(video.duration_seconds / 60)} minutos.`
                  : `Vazio significa ~1 clipe a cada 30s de conteúdo — até ${estimate.clips} aqui.`}
            </Typography>
            {durationError && (
              <Typography variant="caption" sx={{ color: "error.main", mt: 0.5, display: "block" }}>
                O Máx deve ser pelo menos 1 segundo maior que o Mín
              </Typography>
            )}
          </Box>

          {/* Opções avançadas */}
          <Box>
            <Button
              variant="text"
              startIcon={<TuneIcon sx={{ fontSize: 18 }} />}
              endIcon={<ExpandMoreIcon sx={{ fontSize: 18, transform: advancedOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform .15s ease" }} />}
              onClick={() => setAdvancedOpen(v => !v)}
              sx={{
                textTransform: "none", fontWeight: 600, color: "text.secondary",
                px: 0.5, py: 0.5,
                "&:hover": { bgcolor: "action.hover", color: "primary.main" },
              }}
            >
              Opções avançadas
              <Typography variant="caption" sx={{ ml: 0.75, color: "text.secondary", fontWeight: 500 }}>
                buscar momentos específicos · plataforma · gênero
              </Typography>
            </Button>

          <Collapse in={advancedOpen} timeout={200}>
            <Stack spacing={2.5} sx={{ pt: 1.5 }}>

              {/* Busca por linguagem natural */}
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: "block" }}>
                  Buscar momentos específicos <Chip label="opcional" size="small" variant="outlined" sx={{ ml: 0.5, height: 18, fontSize: "0.6rem" }} />
                </Typography>
                <TextField
                  size="small" fullWidth
                  placeholder='ex.: "todas as piadas", "momentos de perguntas e respostas", "quando ele eleva o tom de voz"'
                  value={ai.user_query}
                  onChange={e => setAi(p => ({ ...p, user_query: e.target.value }))}
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
                <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block" }}>
                  Deixe em branco para encontrar os clipes mais virais automaticamente.
                </Typography>
              </Box>

              {/* Plataforma de destino */}
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: "block" }}>
                  Plataforma de destino <Chip label="opcional" size="small" variant="outlined" sx={{ ml: 0.5, height: 18, fontSize: "0.6rem" }} />
                </Typography>
                <TextField select size="small" fullWidth
                  value={ai.target_platform}
                  onChange={e => setAi(p => ({ ...p, target_platform: e.target.value }))}
                >
                  <MenuItem value="">Qualquer (ranking viral geral)</MenuItem>
                  <MenuItem value="tiktok">TikTok — choque / controverso / emocional</MenuItem>
                  <MenuItem value="youtube_shorts">YouTube Shorts — curiosidade / números / história</MenuItem>
                  <MenuItem value="reels">Instagram Reels — emocional / estilo de vida</MenuItem>
                  <MenuItem value="linkedin">LinkedIn — acionável / dados e negócios</MenuItem>
                  <MenuItem value="twitter">Twitter / X — opiniões fortes / debates</MenuItem>
                </TextField>
                <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block" }}>
                  Direciona quais tipos de ganchos a IA prioriza na seleção.
                </Typography>
              </Box>

              {/* Gênero de conteúdo */}
              <Box>
                <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: "block" }}>
                  Gênero do conteúdo <Chip label="opcional" size="small" variant="outlined" sx={{ ml: 0.5, height: 18, fontSize: "0.6rem" }} />
                </Typography>
                <TextField select size="small" fullWidth
                  value={ai.genre}
                  onChange={e => setAi(p => ({ ...p, genre: e.target.value }))}
                >
                  <MenuItem value="">Detecção automática (sem viés)</MenuItem>
                  <MenuItem value="podcast">Podcast — momentos marcantes do convidado</MenuItem>
                  <MenuItem value="interview">Entrevista — melhores respostas de P&amp;R</MenuItem>
                  <MenuItem value="qa">Perguntas &amp; Respostas — pergunta + resposta</MenuItem>
                  <MenuItem value="vlog">Vlog — reações e narrativa pessoal</MenuItem>
                  <MenuItem value="tutorial">Tutorial / Guia — dicas práticas independentes</MenuItem>
                  <MenuItem value="gaming">Jogos / Gaming — jogadas épicas e reações</MenuItem>
                  <MenuItem value="reaction">Reação — picos emocionais</MenuItem>
                  <MenuItem value="lecture">Palestra / Educativo — explicações conceituais</MenuItem>
                </TextField>
                <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block" }}>
                  Indica à IA a estrutura ideal de um "bom clipe" para este tipo de formato.
                </Typography>
              </Box>

            </Stack>
          </Collapse>
          </Box>

          {/* Configurações de cada clipe */}
          <Box>
            <Typography variant="caption" sx={{ fontWeight: 700, color: "text.secondary", letterSpacing: 0.3, display: "block", mb: 0.75 }}>
              Configurações de cada clipe
            </Typography>
            <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>

              {/* Legendas */}
              <SettingRow
                icon={<SubtitlesOutlinedIcon />}
                label="Legendas"
                sublabel={!captionsOn ? "Desativado também oculta a sobreposição de gancho da IA" : null}
                summary={captionsOn
                  ? (CAPTION_STYLE_OPTIONS.find(o => o.v === settings.caption_style)?.label || settings.caption_style)
                  : null}
                control={<RowSwitch checked={captionsOn} />}
                onRowClick={() => set({ caption_style: captionsOn ? "none" : lastStyle.current })}
                expanded={captionsOn}
                divider={false}
              >
                <Stack spacing={1.25}>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {CAPTION_STYLE_OPTIONS.map(s => (
                      <Chip key={s.v} label={s.label} size="small"
                        variant={settings.caption_style === s.v ? "filled" : "outlined"}
                        color={settings.caption_style === s.v ? "primary" : "default"}
                        onClick={(e) => {
                          e.stopPropagation()
                          lastStyle.current = s.v
                          set({ caption_style: s.v })
                        }}
                        sx={{ cursor: "pointer" }} />
                    ))}
                  </Stack>
                  <Box onClick={e => e.stopPropagation()}>
                    <Typography variant="caption" sx={{ fontWeight: 600, mb: 0.5, display: "block" }}>
                      AutoEmoji
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {EMOJI_STYLE_OPTIONS.map(({ v, label }) => (
                        <Chip key={v} label={label} size="small"
                          variant={settings.emoji_style === v ? "filled" : "outlined"}
                          color={settings.emoji_style === v ? "primary" : "default"}
                          onClick={() => set({ emoji_style: v })}
                          sx={{ cursor: "pointer" }} />
                      ))}
                    </Stack>
                    <Typography variant="caption" sx={{ color: "text.secondary", mt: 0.5, display: "block" }}>
                      Adiciona 🔥 💰 ❤️ após palavras correspondentes nas legendas.
                    </Typography>
                  </Box>
                </Stack>
              </SettingRow>

              {/* Silêncio */}
              <SettingRow
                icon={<GraphicEqOutlinedIcon />}
                label="Remover silêncios e hesitações"
                sublabel='Corta pausas longas e "hã/éé" dentro de cada clipe'
                control={<RowSwitch checked={settings.remove_silence} />}
                onRowClick={() => set({ remove_silence: !settings.remove_silence })}
                divider
              />

              {/* Vertical 9:16 */}
              <SettingRow
                icon={<CropPortraitOutlinedIcon />}
                label="Forçar formato vertical (9:16)"
                sublabel="Preenche vídeos horizontais em 9:16 com fundo desfocado"
                control={<RowSwitch checked={settings.force_vertical} />}
                onRowClick={() => set({ force_vertical: !settings.force_vertical })}
                divider
              />

              {/* Transcrição STT */}
              <SettingRow
                icon={<RecordVoiceOverOutlinedIcon />}
                label="Motor de Transcrição (STT)"
                summary={currentEngineSummary}
                control={
                  <ExpandMoreIcon sx={{
                    fontSize: 20, color: "text.secondary", flexShrink: 0,
                    transform: transcriptOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform .15s ease",
                  }} />
                }
                onRowClick={() => setTranscriptOpen(v => !v)}
                expanded={transcriptOpen}
                divider
              >
                <Box onClick={e => e.stopPropagation()}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={transcribeEnabled}
                        onChange={e => set({ force_retranscribe: e.target.checked })}
                        disabled={!hasSegments}
                        size="small"
                      />
                    }
                    label={
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        Executar Transcrição {hasSegments
                          ? <Chip label="transcrição em cache disponível" size="small" color="success" variant="outlined" sx={{ ml: 0.5, height: 18, fontSize: "0.65rem" }} />
                          : <Chip label="necessário" size="small" color="warning" variant="outlined" sx={{ ml: 0.5, height: 18, fontSize: "0.65rem" }} />
                        }
                      </Typography>
                    }
                    sx={{ mb: 0.5 }}
                  />
                  {!hasSegments && (
                    <Typography variant="caption" sx={{ color: "text.secondary", display: "block", ml: 4, mb: 1 }}>
                      Nenhuma transcrição em nível de palavra encontrada — o áudio será transcrito primeiro.
                    </Typography>
                  )}
                  {hasSegments && settings.force_retranscribe && (
                    <Typography variant="caption" sx={{ color: "warning.main", display: "block", ml: 4, mb: 1 }}>
                      Transcreve novamente com o motor selecionado (substitui o cache existente).
                    </Typography>
                  )}

                  <Stack spacing={1.5} sx={{ mt: 1 }}>
                    <TextField select size="small" fullWidth
                      label="Motor & Qualidade"
                      value={isGroqActive ? "groq_auto" : (settings.whisper_quality || "balanced")}
                      onChange={e => {
                        const val = e.target.value
                        if (val === "groq_auto") {
                          set({ whisper_backend: "groq", whisper_quality: "fast" })
                        } else {
                          set({ whisper_backend: "local", whisper_quality: val })
                        }
                      }}
                      disabled={!transcribeEnabled}
                    >
                      {(groqConfigured || globalSettings?.stt_provider === "groq" || settings?.whisper_backend === "groq") && (
                        <MenuItem value="groq_auto">
                          <Stack direction="row" justifyContent="space-between" sx={{ width: "100%" }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: "primary.main" }}>
                              ⚡ Groq Whisper Cloud (Ultra-Rápido ~5s)
                            </Typography>
                            <Typography variant="caption" sx={{ color: "text.secondary", ml: 2 }}>
                              LPU na nuvem (Recomendado)
                            </Typography>
                          </Stack>
                        </MenuItem>
                      )}
                      {WHISPER_QUALITIES.filter(q => q.value !== "groq_auto").map(q => (
                        <MenuItem key={q.value} value={q.value}>
                          <Stack direction="row" justifyContent="space-between" sx={{ width: "100%" }}>
                            <Typography variant="body2">{q.label}</Typography>
                            <Typography variant="caption" sx={{ color: "text.secondary", ml: 2 }}>{q.desc}</Typography>
                          </Stack>
                        </MenuItem>
                      ))}
                    </TextField>

                    {isGroqActive && (
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ bgcolor: "action.hover", p: 1, borderRadius: 1.5 }}>
                        <BoltIcon sx={{ color: "#F55036", fontSize: 18 }} />
                        <Typography variant="caption" sx={{ color: "text.secondary" }}>
                          Motor Groq Cloud ativo: transcrição quase instantânea com Whisper Large v3 e fallback local para arquivos &gt; 25MB.
                        </Typography>
                      </Stack>
                    )}
                  </Stack>
                </Box>
              </SettingRow>

            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancelar</Button>
        <Button variant="contained" startIcon={<ContentCutIcon />}
          disabled={!canSubmit}
          onClick={() => {
            onExtract(video.id, {
              ...clipSettingsPayload(settings, { hasTranscript: hasSegments }),
              ...ai,
              mode: "ai",
            })
            onClose()
          }}>
          {`Cortar agora · ${estimate.label}`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
