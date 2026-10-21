import { useState, useEffect } from "react"
import {
  Box, Typography, Stack, Card, CardContent,
  Button, alpha, useTheme,
} from "@mui/material"
import ShareIcon from "@mui/icons-material/ShareOutlined"
import MonitorHeartIcon from "@mui/icons-material/MonitorHeartOutlined"
import KeyIcon from "@mui/icons-material/VpnKeyOutlined"
import SmartToyIcon from "@mui/icons-material/SmartToyOutlined"
import MovieFilterIcon from "@mui/icons-material/MovieFilterOutlined"
import PhoneIphoneIcon from "@mui/icons-material/PhoneIphoneOutlined"
import GraphicEqIcon from "@mui/icons-material/GraphicEqOutlined"
import RecordVoiceOverIcon from "@mui/icons-material/RecordVoiceOverOutlined"
import HealthDashboard from "../components/settings/HealthDashboard"
import MotionGraphicsSection from "../components/settings/MotionGraphicsSection"
import AIProviderSection from "../components/settings/AIProviderSection"
import ServiceKeysSection from "../components/settings/ServiceKeysSection"
import STTSection from "../components/settings/STTSection"
import TTSSection from "../components/settings/TTSSection"
import MessagingSection from "../components/settings/MessagingSection"
import SocialConnectionsSection from "../components/settings/SocialConnectionsSection"
import useSettings from "../hooks/useSettings"
import useAppStore from "../store/appStore"

function Section({ icon, title, description, children, accentColor }) {
  const theme = useTheme()
  const color = accentColor || theme.palette.primary.main
  return (
    <Card sx={{
      overflow: "visible",
      "&:hover": { borderColor: alpha(color, 0.25) },
    }}>
      <CardContent sx={{ p: 0, "&:last-child": { pb: 0 } }}>
        {title && (
          <Box sx={{
            px: 3, pt: 2.5, pb: 2,
            background: `linear-gradient(135deg, ${alpha(color, 0.06)}, ${alpha(color, 0.02)})`,
            borderBottom: 1, borderColor: "divider",
          }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              {icon && (
                <Box sx={{
                  width: 36, height: 36, borderRadius: 2,
                  bgcolor: alpha(color, 0.1),
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: color,
                }}>
                  {icon}
                </Box>
              )}
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: "1rem", lineHeight: 1.3 }}>{title}</Typography>
                {description && (
                  <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "0.8rem", mt: 0.25 }}>
                    {description}
                  </Typography>
                )}
              </Box>
            </Stack>
          </Box>
        )}
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      </CardContent>
    </Card>
  )
}


export default function Settings() {
  const { settings, loading, error, fetchSettings, updateSettings } = useSettings()
  const showToast = useAppStore((s) => s.showToast)

  useEffect(() => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    let handled = false

    if (params.get("youtube_connected") === "true") {
      const channel = params.get("channel")
      showToast(`YouTube conectado com sucesso!${channel ? ` Canal: ${channel}` : ""}`, "success")
      handled = true
    } else if (params.get("youtube_error")) {
      showToast(`Erro ao conectar YouTube: ${params.get("youtube_error")}`, "error")
      handled = true
    }

    if (params.get("tiktok_connected") === "true") {
      showToast("TikTok conectado com sucesso!", "success")
      handled = true
    } else if (params.get("tiktok_error")) {
      showToast(`Erro ao conectar TikTok: ${params.get("tiktok_error")}`, "error")
      handled = true
    }

    if (params.get("instagram_connected") === "true") {
      const account = params.get("account")
      showToast(`Instagram Reels conectado com sucesso!${account ? ` Conta: @${account}` : ""}`, "success")
      handled = true
    } else if (params.get("instagram_error")) {
      showToast(`Erro ao conectar Instagram: ${params.get("instagram_error")}`, "error")
      handled = true
    }

    if (handled) {
      if (fetchSettings) fetchSettings()
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [fetchSettings, showToast])

  if (loading) return (
    <Box sx={{ p: 4, display: "flex", justifyContent: "center" }}>
      <Typography sx={{ color: "text.secondary" }}>Carregando configurações...</Typography>
    </Box>
  )
  if (error || !settings) return (
    <Box sx={{ p: 4, textAlign: "center" }}>
      <Typography sx={{ color: "error.main", mb: 2 }}>{error || "Falha ao carregar configurações"}</Typography>
      <Button variant="outlined" onClick={fetchSettings}>Tentar novamente</Button>
    </Box>
  )

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* ── Header ── */}
      <Box sx={{
        px: 3, py: 2, flexShrink: 0,
        borderBottom: 1, borderColor: "divider",
        background: (t) => t.palette.mode === "dark"
          ? "linear-gradient(135deg, rgba(107,114,128,0.10) 0%, rgba(30,28,26,1) 100%)"
          : "linear-gradient(135deg, rgba(107,114,128,0.07) 0%, rgba(255,255,255,1) 100%)",
      }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <KeyIcon sx={{ color: "text.secondary", fontSize: 26 }} />
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: -0.3 }}>
              Configurações
            </Typography>
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              Gerencie seus provedores de IA, mensageiros e integridade do sistema
            </Typography>
          </Box>
        </Stack>
      </Box>

      {/* ── Scrollable content ── */}
      <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, md: 3 } }}>
      <Stack spacing={3} sx={{ maxWidth: 900, mx: "auto" }}>
        {/* 1. Provedor de IA (BYOK) */}
        <Section
          icon={<SmartToyIcon sx={{ fontSize: 20 }} />}
          title="Provedor de IA"
          description="Conecte sua chave da Anthropic, OpenAI, OpenRouter ou servidor local compatível (Ollama, LM Studio) — criptografadas neste servidor"
          accentColor="#0d9f6e"
        >
          <AIProviderSection settings={settings} updateSettings={updateSettings} />
        </Section>

        {/* 2. Chaves de API de Serviços (BYOK) */}
        <Section
          icon={<KeyIcon sx={{ fontSize: 20 }} />}
          title="Chaves de API de Serviços"
          description="Chaves de API dos serviços (YouTube, Pexels, Pixabay, Groq, Google TTS pool, ElevenLabs pool) — criptografadas localmente"
          accentColor="#2563eb"
        >
          <ServiceKeysSection settings={settings} updateSettings={updateSettings} />
        </Section>

        {/* 3. Redes Sociais & Publicação (OAuth) */}
        <Section
          icon={<ShareIcon sx={{ fontSize: 20 }} />}
          title="Redes Sociais & Publicação (OAuth)"
          description="Conecte seus canais e perfis (YouTube Shorts, TikTok, Instagram Reels) para agendamento de posts e publicação direta com 1 clique"
          accentColor="#fe2c55"
        >
          <SocialConnectionsSection settings={settings} updateSettings={updateSettings} fetchSettings={fetchSettings} />
        </Section>

        {/* 4. Transcrição e Legendas (STT) */}
        <Section
          icon={<GraphicEqIcon sx={{ fontSize: 20 }} />}
          title="Transcrição e Legendas (STT)"
          description="Motor de transcrição de áudio: Groq Whisper Cloud ultra-rápido ou Faster-Whisper local no servidor"
          accentColor="#F55036"
        >
          <STTSection settings={settings} updateSettings={updateSettings} />
        </Section>

        {/* 5. Voz e Narração (TTS) */}
        <Section
          icon={<RecordVoiceOverIcon sx={{ fontSize: 20 }} />}
          title="Voz e Narração (TTS)"
          description="Provedor de narração padrão (Edge TTS gratuito, Google TTS [Cloud e AI Studio] com pool, ElevenLabs com pool ou OpenAI TTS)"
          accentColor="#4285F4"
        >
          <TTSSection settings={settings} updateSettings={updateSettings} />
        </Section>

        {/* 6. Messaging — Telegram / WhatsApp / Discord / Slack. Was the /messaging
            page; /messaging now redirects to /settings#messaging, and
            ?messaging=<app> opens the setup dialog on that app's tab. */}
        <Section
          icon={<PhoneIphoneIcon sx={{ fontSize: 20 }} />}
          title="Mensageiros"
          description="Interaja com o ViralMint pelo celular (Telegram, WhatsApp, Discord, Slack) e receba notificações de conclusão"
          accentColor="#5865F2"
        >
          <MessagingSection />
        </Section>

        {/* Optional add-ons */}
        <Section
          icon={<MovieFilterIcon sx={{ fontSize: 20 }} />}
          title="Módulos Adicionais"
          description="Módulos opcionais que podem ser instalados sob demanda no seu diretório de dados"
          accentColor="#7c3aed"
        >
          <MotionGraphicsSection />
        </Section>

        {/* System Health */}
        <Section
          icon={<MonitorHeartIcon sx={{ fontSize: 20 }} />}
          title="Integridade do Sistema"
          description="Status dos serviços locais, verificação de dependências e uso de armazenamento"
          accentColor="#dc2626"
        >
          <HealthDashboard />
        </Section>
      </Stack>
      </Box>{/* end scrollable content */}
    </Box>
  )
}
