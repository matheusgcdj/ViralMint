// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2025-2026 ViralMint Contributors
import { useState } from "react"
import {
  Box, Typography, Button, Stack, CircularProgress, Alert, Link, IconButton, Tooltip,
} from "@mui/material"
import ContentCopyIcon from "@mui/icons-material/ContentCopyOutlined"
import CheckIcon from "@mui/icons-material/Check"
import TelegramIcon from "@mui/icons-material/Telegram"
import WhatsAppIcon from "@mui/icons-material/WhatsApp"
import QrCodeIcon from "@mui/icons-material/QrCode2Outlined"
import ChatBubbleIcon from "@mui/icons-material/ChatBubbleOutlined"
import TagIcon from "@mui/icons-material/TagOutlined"
import LogoutIcon from "@mui/icons-material/LogoutOutlined"
import { QRCodeCanvas } from "qrcode.react"
import { STATE, WA_STATE, DC_STATE, SL_STATE } from "../../hooks/useMessagingChannel"
import ChannelPanel, { brandButtonSx } from "./ChannelPanel"
import TokenField from "./TokenField"

/**
 * The four messaging apps: identity (name, glyph, brand colour) and the body
 * of each one's setup tab. The copy and the connect inputs are carried over
 * from the old /messaging page (now Settings → Messaging); only the framing
 * changed.
 *
 * `iconColor` is a pair because Slack's aubergine is unreadable on a dark
 * surface; the other three brand colours hold up in both themes.
 */
export const CHANNELS = [
  {
    key: "telegram", name: "Telegram", Icon: TelegramIcon,
    brand: "#229ED9", brandHover: "#1B87BA",
    iconColor: { light: "#229ED9", dark: "#4FB4E6" },
    caption: "Chat bidirecional com o ViralMint e notificações de tarefas, através de um bot criado por você.",
  },
  {
    key: "whatsapp", name: "WhatsApp", Icon: WhatsAppIcon,
    brand: "#25D366", brandHover: "#128C7E",
    iconColor: { light: "#1DAA52", dark: "#25D366" },
    caption: "Chat bidirecional e notificações. Emparelha escaneando um QR code, como no WhatsApp Web.",
  },
  {
    key: "discord", name: "Discord", Icon: ChatBubbleIcon,
    brand: "#5865F2", brandHover: "#4752C4",
    iconColor: { light: "#5865F2", dark: "#7C87F5" },
    caption: "Envie mensagens diretas (DM) ao seu bot para conversar com o ViralMint e receber notificações.",
  },
  {
    key: "slack", name: "Slack", Icon: TagIcon,
    brand: "#611F69", brandHover: "#4A154B",
    iconColor: { light: "#611F69", dark: "#D48FDD" },
    caption: "Modo Socket, sem necessidade de URL pública. Envie mensagens diretas (DM) ao seu bot para conversar e receber notificações.",
  },
]

const STATES = { telegram: STATE, whatsapp: WA_STATE, discord: DC_STATE, slack: SL_STATE }

/**
 * One status vocabulary for the tiles and the tab dots.
 *   tone: "connected" | "pending" (needs one more step) | "unavailable" | "off"
 *   detail: the short line under the app's name on its tile
 */
export function channelStatus(key, ch) {
  const S = STATES[key]
  if (ch.state === S.UNAVAILABLE) {
    return { tone: "unavailable", label: "Indisponível", detail: "Requer pacote ausente — abra para detalhes" }
  }
  if (ch.state === S.CONNECTED) {
    const who = {
      telegram: ch.info.bot_username && `@${ch.info.bot_username}`,
      whatsapp: "Emparelhado com seu celular",
      discord: ch.info.bot_username,
      slack: ch.info.team_name,
    }[key]
    return { tone: "connected", label: "Conectado", detail: who || "Conectado" }
  }
  if (ch.state === S.RECONNECTING) {
    return { tone: "pending", label: "Reconectando…", detail: "Emparelhado — reconectando automaticamente" }
  }
  if (ch.state === S.AWAITING_START || ch.state === S.AWAITING_DM || ch.state === WA_STATE.PAIRING) {
    return { tone: "pending", label: ch.chip.label, detail: {
      telegram: "Vincule o bot à sua conta para concluir",
      whatsapp: "Escaneie o QR code no seu celular para concluir",
      discord: "Envie o código de emparelhamento por DM ao bot para concluir",
      slack: "Envie o código de emparelhamento por DM ao bot para concluir",
    }[key] }
  }
  if (ch.state === S.CONNECTING) {
    return { tone: "pending", label: "Conectando…", detail: "Conectando…" }
  }
  return { tone: "off", label: "Não conectado", detail: "Não conectado" }
}

export function isAwaiting(key, ch) {
  const S = STATES[key]
  return ch.state === S.AWAITING_START || ch.state === S.AWAITING_DM
}

// Paired but offline for now: same actions as Connected, honest wording.
function ReconnectingNote() {
  return (
    <Alert severity="warning" variant="outlined">
      Emparelhado, mas a conexão caiu temporariamente. O ViralMint está reconectando automaticamente — não é necessário refazer nada. Mensagens enviadas enquanto isso podem chegar com atraso.
    </Alert>
  )
}

function MissingPackage({ pkg, error }) {
  return (
    <Alert severity="warning" variant="outlined">
      Este canal requer o pacote Python <code>{pkg}</code>. Instale as dependências com{" "}
      <code>pip install -r requirements.txt</code> e reinicie o aplicativo.
      {error && (
        <Typography variant="caption" display="block" sx={{ mt: 1, opacity: 0.8 }}>
          Detalhes: {error}
        </Typography>
      )}
    </Alert>
  )
}

/**
 * The one-time pairing code, big enough to read off the screen, with a copy
 * button. The bot binds to whoever sends it and ignores everyone else, so the
 * copy says so — it is the reason the step exists.
 */
function PairCode({ code }) {
  const [copied, setCopied] = useState(false)
  if (!code) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked — the code is on screen */ }
  }
  return (
    <Stack direction="row" spacing={1} alignItems="center" data-testid="pair-code">
      <Box sx={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: "1.35rem", fontWeight: 700, letterSpacing: "0.22em",
        px: 1.5, py: 0.5, borderRadius: 1.5,
        border: 1, borderColor: "divider", bgcolor: "action.hover",
      }}>
        {code}
      </Box>
      <Tooltip title={copied ? "Copiado" : "Copiar código"}>
        <IconButton size="small" onClick={copy} aria-label="Copiar código de emparelhamento">
          {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
        </IconButton>
      </Tooltip>
    </Stack>
  )
}

const PRIVATE_NOTE = "O bot vincula-se exclusivamente a quem enviar este código e ignora outros usuários."

function BotLink({ url, name, fallback }) {
  if (url) {
    return <Link href={url} target="_blank" rel="noreferrer" sx={{ fontWeight: 600 }}>{name}</Link>
  }
  return <strong>{name || fallback}</strong>
}

function ConnectButton({ meta, onClick, disabled, busy, children, startIcon }) {
  return (
    <Box>
      <Button
        variant="contained" disableElevation
        onClick={onClick}
        disabled={disabled}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : startIcon}
        sx={brandButtonSx(meta.brand, meta.brandHover)}
      >
        {children}
      </Button>
    </Box>
  )
}

function TelegramBody({ meta, ch, onRefresh }) {
  const bot = ch.info.bot_username ? `@${ch.info.bot_username}` : ""
  return (
    <ChannelPanel
      brandColor={meta.brand} brandHoverColor={meta.brandHover}
      isConnected={ch.state === STATE.CONNECTED || ch.state === STATE.RECONNECTING}
      isAwaiting={ch.state === STATE.AWAITING_START}
      testing={ch.testing} onTest={ch.test} onDisconnect={ch.disconnect} onRefresh={onRefresh}
      connectedSlot={ch.state === STATE.RECONNECTING ? <ReconnectingNote /> :
        <Alert severity="success" variant="outlined">
          Conectado a <BotLink url={ch.info.bot_url} name={bot} />. Envie qualquer mensagem para seu bot para conversar com o ViralMint.
        </Alert>
      }
      awaitingSlot={
        <Alert severity="info" variant="outlined" icon={false}>
          <Stack spacing={1.25}>
            <Typography variant="body2">
              Bot pronto. Abra <BotLink url={ch.info.bot_url} name={bot} fallback="seu bot" /> no
              Telegram e toque em <strong>Iniciar (Start)</strong> — o link contém seu código de emparelhamento, então
              esse clique vincula o bot diretamente à sua conta. Se o Telegram não exibir o botão Iniciar, envie este código ao bot:
            </Typography>
            <PairCode code={ch.info.pair_code} />
            <Typography variant="caption" color="text.secondary">{PRIVATE_NOTE}</Typography>
          </Stack>
        </Alert>
      }
      defaultSlot={
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Crie um bot com o{" "}
            <Link href="https://t.me/BotFather" target="_blank" rel="noreferrer">@BotFather</Link>
            {" "}no Telegram (envie <code>/newbot</code>) e cole o token do bot abaixo.
          </Typography>
          <TokenField
            label="Token do bot"
            placeholder="123456789:ABCdef..."
            value={ch.tokens.bot_token}
            onChange={(e) => ch.setToken("bot_token", e.target.value)}
            disabled={ch.saving}
          />
          <ConnectButton
            meta={meta} onClick={ch.connect} busy={ch.saving}
            disabled={ch.saving || !ch.tokens.bot_token.trim()}
          >
            {ch.saving ? "Conectando…" : "Conectar Telegram"}
          </ConnectButton>
        </Stack>
      }
    />
  )
}

function WhatsAppBody({ meta, ch, onRefresh }) {
  const pairing = ch.state === WA_STATE.PAIRING
  return (
    <ChannelPanel
      brandColor={meta.brand} brandHoverColor={meta.brandHover}
      isConnected={ch.state === WA_STATE.CONNECTED || ch.state === WA_STATE.RECONNECTING}
      isAwaiting={false}
      testing={ch.testing} onTest={ch.test} onDisconnect={ch.disconnect} onRefresh={onRefresh}
      unavailableSlot={ch.state === WA_STATE.UNAVAILABLE
        ? <MissingPackage pkg="neonize" error={ch.info.error} /> : null}
      connectedSlot={ch.state === WA_STATE.RECONNECTING ? <ReconnectingNote /> :
        <Alert severity="success" variant="outlined">
          WhatsApp está emparelhado. Para conversar com o ViralMint, envie mensagens no seu próprio chat de <strong>Mensagens para si mesmo (Message yourself)</strong>; notificações de tarefas também chegam por lá. Mensagens em outros chats nunca são lidas.
        </Alert>
      }
      defaultSlot={pairing ? (
        // The QR used to open in a second dialog stacked on the page. Inside
        // this tab it simply takes the tab's place until pairing completes.
        <Stack spacing={2} alignItems="center" data-testid="whatsapp-qr">
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
            No seu celular, abra <strong>WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho</strong> e escaneie este código.
          </Typography>
          {ch.qr ? (
            // White on purpose: a QR code needs a light background in either theme.
            <Box sx={{ p: 2, bgcolor: "#fff", borderRadius: 2, boxShadow: 1 }}>
              <QRCodeCanvas value={ch.qr} size={220} level="M" includeMargin={false} />
            </Box>
          ) : (
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ py: 6 }}>
              <CircularProgress size={20} />
              <Typography variant="body2" color="text.secondary">Aguardando o QR code…</Typography>
            </Stack>
          )}
          <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center" }}>
            O código atualiza automaticamente. O status mudará para Conectado assim que seu celular emparelhar.
          </Typography>
          <Button onClick={ch.disconnect} color="error" startIcon={<LogoutIcon />}>
            Cancel pairing
          </Button>
        </Stack>
      ) : (
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Receba alertas de busca, download e renderização no WhatsApp — e converse com o ViralMint direto do seu celular. Conecta em segundos, igual ao WhatsApp Web.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Clique em Exibir QR code e abra WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho para escanear.
          </Typography>
          <ConnectButton
            meta={meta} onClick={ch.connect} busy={ch.saving}
            disabled={ch.saving} startIcon={<QrCodeIcon />}
          >
            {ch.saving ? "Gerando QR code…" : "Exibir QR code"}
          </ConnectButton>
        </Stack>
      )}
    />
  )
}

function DiscordBody({ meta, ch, onRefresh }) {
  return (
    <ChannelPanel
      brandColor={meta.brand} brandHoverColor={meta.brandHover}
      isConnected={ch.state === DC_STATE.CONNECTED || ch.state === DC_STATE.RECONNECTING}
      isAwaiting={ch.state === DC_STATE.AWAITING_DM}
      testing={ch.testing} onTest={ch.test} onDisconnect={ch.disconnect} onRefresh={onRefresh}
      unavailableSlot={ch.state === DC_STATE.UNAVAILABLE
        ? <MissingPackage pkg="discord.py" error={ch.info.error} /> : null}
      connectedSlot={ch.state === DC_STATE.RECONNECTING ? <ReconnectingNote /> :
        <Alert severity="success" variant="outlined">
          Conectado como <strong>{ch.info.bot_username}</strong>. Envie mensagens diretas (DM) ao seu bot no Discord para conversar com o ViralMint; as notificações chegam na mesma conversa.
        </Alert>
      }
      awaitingSlot={
        <Alert severity="info" variant="outlined" icon={false}>
          <Stack spacing={1.25}>
            <Typography variant="body2">
              Bot online como <strong>{ch.info.bot_username}</strong>.
              {ch.info.bot_invite_url && (
                <>
                  {" "}
                  <Link href={ch.info.bot_invite_url} target="_blank" rel="noreferrer" sx={{ fontWeight: 600 }}>
                    Convide-o para um servidor
                  </Link>
                  {" "}se ainda não o fez, e em seguida
                </>
              )}
              {" "}envie este código de emparelhamento por DM ao bot:
            </Typography>
            <PairCode code={ch.info.pair_code} />
            <Typography variant="caption" color="text.secondary">{PRIVATE_NOTE}</Typography>
          </Stack>
        </Alert>
      }
      defaultSlot={
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Crie um bot em{" "}
            <Link href="https://discord.com/developers/applications" target="_blank" rel="noreferrer">
              discord.com/developers/applications
            </Link>
            : clique em <strong>New Application</strong>, depois em <strong>Bot</strong>, copie o token e cole-o abaixo. As DMs funcionam sem necessidade de privileged intents.
          </Typography>
          <TokenField
            label="Token do bot"
            placeholder="MTI..."
            value={ch.tokens.bot_token}
            onChange={(e) => ch.setToken("bot_token", e.target.value)}
            disabled={ch.saving}
          />
          <ConnectButton
            meta={meta} onClick={ch.connect} busy={ch.saving}
            disabled={ch.saving || !ch.tokens.bot_token.trim()}
          >
            {ch.saving ? "Conectando…" : "Conectar Discord"}
          </ConnectButton>
        </Stack>
      }
    />
  )
}

function SlackBody({ meta, ch, onRefresh }) {
  return (
    <ChannelPanel
      brandColor={meta.brand} brandHoverColor={meta.brandHover}
      isConnected={ch.state === SL_STATE.CONNECTED}
      isAwaiting={ch.state === SL_STATE.AWAITING_DM}
      testing={ch.testing} onTest={ch.test} onDisconnect={ch.disconnect} onRefresh={onRefresh}
      unavailableSlot={ch.state === SL_STATE.UNAVAILABLE
        ? <MissingPackage pkg="slack-sdk" error={ch.info.error} /> : null}
      connectedSlot={
        <Alert severity="success" variant="outlined">
          Conectado a <strong>{ch.info.team_name || "seu workspace do Slack"}</strong>. Envie mensagens diretas (DM) ao seu bot no Slack para conversar com o ViralMint; as notificações chegam na mesma conversa.
        </Alert>
      }
      awaitingSlot={
        <Alert severity="info" variant="outlined" icon={false}>
          <Stack spacing={1.25}>
            <Typography variant="body2">
              Bot online{ch.info.team_name ? ` em ${ch.info.team_name}` : ""}. Abra o Slack, encontre seu bot na barra lateral e envie este código de emparelhamento por DM:
            </Typography>
            <PairCode code={ch.info.pair_code} />
            <Typography variant="caption" color="text.secondary">{PRIVATE_NOTE}</Typography>
          </Stack>
        </Alert>
      }
      defaultSlot={
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Crie um aplicativo Slack em{" "}
            <Link href="https://api.slack.com/apps" target="_blank" rel="noreferrer">api.slack.com/apps</Link>.
            Ative o <strong>Socket Mode</strong>, gere um token em nível de aplicativo com{" "}
            <code>connections:write</code> e instale o bot no seu workspace com os escopos{" "}
            <code>chat:write</code>, <code>im:history</code>, <code>im:read</code>,{" "}
            <code>im:write</code> e <code>users:read</code>. Em seguida, assine o evento{" "}
            <code>message.im</code>.
          </Typography>
          <TokenField
            label="Token do bot (xoxb-…)"
            placeholder="xoxb-..."
            value={ch.tokens.bot_token}
            onChange={(e) => ch.setToken("bot_token", e.target.value)}
            disabled={ch.saving}
          />
          <TokenField
            label="Token em nível de aplicativo (xapp-…)"
            placeholder="xapp-..."
            value={ch.tokens.app_token}
            onChange={(e) => ch.setToken("app_token", e.target.value)}
            disabled={ch.saving}
          />
          <ConnectButton
            meta={meta} onClick={ch.connect} busy={ch.saving}
            disabled={ch.saving || !ch.tokens.bot_token.trim() || !ch.tokens.app_token.trim()}
          >
            {ch.saving ? "Conectando…" : "Conectar Slack"}
          </ConnectButton>
        </Stack>
      }
    />
  )
}

const BODIES = { telegram: TelegramBody, whatsapp: WhatsAppBody, discord: DiscordBody, slack: SlackBody }

/** The setup body for one app, chosen by key. */
export function ChannelBody({ meta, ch, onRefresh }) {
  const Body = BODIES[meta.key]
  return <Body meta={meta} ch={ch} onRefresh={onRefresh} />
}
