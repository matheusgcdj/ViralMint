import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { Box, Typography, Stack, CardActionArea, Divider, TextField, InputAdornment } from "@mui/material"
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined"
import useDocumentTitle from "../hooks/useDocumentTitle"
import PageHero from "../components/PageHero"
import { alpha } from "@mui/material/styles"
import { GlassCard } from "../utils/glassFx"
import BuildOutlinedIcon from "@mui/icons-material/BuildOutlined"
import SubtitlesOutlinedIcon from "@mui/icons-material/SubtitlesOutlined"
import AspectRatioOutlinedIcon from "@mui/icons-material/AspectRatioOutlined"
import GraphicEqOutlinedIcon from "@mui/icons-material/GraphicEqOutlined"
import BrandingWatermarkOutlinedIcon from "@mui/icons-material/BrandingWatermarkOutlined"
import FastRewindOutlinedIcon from "@mui/icons-material/FastRewindOutlined"
import RecordVoiceOverOutlinedIcon from "@mui/icons-material/RecordVoiceOverOutlined"
import GraphicEqIcon from "@mui/icons-material/GraphicEq"
import TransformIcon from "@mui/icons-material/Transform"
import LightbulbOutlinedIcon from "@mui/icons-material/LightbulbOutlined"
import TranslateOutlinedIcon from "@mui/icons-material/TranslateOutlined"
import MovieFilterOutlinedIcon from "@mui/icons-material/MovieFilterOutlined"
import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined"
import HeadphonesOutlinedIcon from "@mui/icons-material/HeadphonesOutlined"
import ClosedCaptionOutlinedIcon from "@mui/icons-material/ClosedCaptionOutlined"
import GifOutlinedIcon from "@mui/icons-material/GifOutlined"
import SpeedOutlinedIcon from "@mui/icons-material/SpeedOutlined"
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined"
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered"
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined"
import ZoomInMapOutlinedIcon from "@mui/icons-material/ZoomInMapOutlined"
import CompressOutlinedIcon from "@mui/icons-material/CompressOutlined"
import CropOutlinedIcon from "@mui/icons-material/CropOutlined"
import VolumeOffOutlinedIcon from "@mui/icons-material/VolumeOffOutlined"
import DownloadForOfflineOutlinedIcon from "@mui/icons-material/DownloadForOfflineOutlined"
import ArticleOutlinedIcon from "@mui/icons-material/ArticleOutlined"

// ── Catalog ────────────────────────────────────────────────────────────────
//
// Each tool has a `category` that maps into the CATEGORIES array below.
// The open-source build ships the local FFmpeg / Whisper / Edge-TTS tools;
// media-generation tools (AI image / music / video / SFX / thumbnail) are
// not part of this build since they require external media-gen providers.

const TOOLS = [
  // Video — visual / structural edits
  {
    id: "video-download",
    title: "Baixar Vídeo",
    description: "Cole o link e baixe o vídeo diretamente — escolha a qualidade e mantenha ou incorpore legendas.",
    icon: <DownloadForOfflineOutlinedIcon />,
    category: "video",
  },
  {
    id: "merge-clips",
    title: "Juntar Clipes",
    description: "Junte múltiplos clipes em um único vídeo com ajuste automático de proporção.",
    icon: <MovieFilterOutlinedIcon />,
    category: "video",
  },
  {
    id: "transform",
    title: "Transformar Vídeo",
    description: "Inverta, gire, crie loops ou altere o volume de um clipe.",
    icon: <TransformIcon />,
    category: "video",
  },
  {
    // One runner, one job type, one history — but its own card, because
    // "remove audio" is what people search for, not "transform".
    id: "remove-audio",
    title: "Remover Áudio",
    description: "Remova o áudio de um vídeo mantendo a qualidade visual original intacta.",
    icon: <VolumeOffOutlinedIcon />,
    category: "audio",
    route: "/tools/transform?op=mute",
  },
  {
    id: "compress",
    title: "Comprimir Vídeo",
    description: "Reduza o tamanho do arquivo para redes sociais ou limites de upload, escolhendo o nível de compressão.",
    icon: <CompressOutlinedIcon />,
    category: "video",
  },
  {
    id: "crop",
    title: "Recortar Quadro",
    description: "Selecione uma área do quadro e mantenha apenas essa região. Proporção livre ou pré-definida.",
    icon: <CropOutlinedIcon />,
    category: "video",
  },
  {
    id: "reframe",
    title: "Reenquadrar para Vertical (9:16)",
    description: "Converta vídeos horizontais (16:9) em verticais (9:16) com foco automático em rostos para Shorts e TikTok.",
    icon: <AspectRatioOutlinedIcon />,
    category: "video",
  },
  {
    id: "watermark",
    title: "Adicionar Marca d'Água",
    description: "Adicione sua marca d'água ou logotipo com controle de posicionamento, opacidade e escala.",
    icon: <BrandingWatermarkOutlinedIcon />,
    category: "video",
  },
  {
    id: "gif",
    title: "Vídeo para GIF",
    description: "Converta qualquer trecho em GIF animado com paleta de duas etapas para cores nítidas.",
    icon: <GifOutlinedIcon />,
    category: "video",
  },
  {
    id: "speed",
    title: "Acelerar / Desacelerar",
    description: "Acelere ou desacelere vídeos de 0.25× a 4×, preservando o tom natural da voz.",
    icon: <SpeedOutlinedIcon />,
    category: "video",
  },
  {
    id: "trim",
    title: "Cortar Trecho",
    description: "Corte o trecho exato definindo início e fim, descartando o restante.",
    icon: <ContentCutOutlinedIcon />,
    category: "video",
  },
  {
    id: "auto-zoom",
    title: "Auto-Zoom Dinâmico",
    description: "Aplica zooms sutis sincronizados com as falas para aumentar o dinamismo do conteúdo.",
    icon: <ZoomInMapOutlinedIcon />,
    category: "video",
  },

  // Audio — cleanup / processing / voice
  {
    id: "voiceover",
    title: "Gerador de Narração",
    description: "Transforme texto ou roteiro em narração natural com vozes neurais.",
    icon: <RecordVoiceOverOutlinedIcon />,
    category: "audio",
  },
  {
    id: "audio-enhance",
    title: "Aprimorar Áudio",
    description: "Remova ruídos de fundo, normalize o volume e destaque a clareza da voz.",
    icon: <GraphicEqOutlinedIcon />,
    category: "audio",
  },
  {
    id: "remove-silence",
    title: "Remover Silêncio",
    description: "Corte automaticamente pausas, silêncios prolongados e momentos mortos.",
    icon: <FastRewindOutlinedIcon />,
    category: "audio",
  },
  {
    id: "music-visualizer",
    title: "Visualizador Musical",
    description: "Gere vídeos animados de waveform, barras ou espectro sincronizados ao áudio.",
    icon: <GraphicEqIcon />,
    category: "audio",
  },

  // Subtitles & Insights — text overlays + analysis
  {
    id: "captions",
    title: "Adicionar Legendas",
    description: "Gere legendas dinâmicas palavra por palavra em estilos modernos e virais.",
    icon: <SubtitlesOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "subtitles",
    title: "Exportar Legendas",
    description: "Transcreva o áudio para download em arquivos .srt, .vtt ou texto simples.",
    icon: <ClosedCaptionOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "transcript",
    title: "Baixar Transcrição",
    description: "Baixe diretamente as legendas existentes de um vídeo em .txt, .srt ou .vtt sem precisar transcrever.",
    icon: <ArticleOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "translate",
    title: "Traduzir e Dublar",
    description: "Traduza legendas para mais de 19 idiomas ou realize dublagem completa com IA.",
    icon: <TranslateOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "hook-analysis",
    title: "Detector de Ganchos",
    description: "Analise a retenção dos primeiros 10 segundos e receba sugestões de ganchos virais.",
    icon: <LightbulbOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "metadata",
    title: "Título, Tags e Descrição",
    description: "Metadados de SEO (títulos, tags e descrição) otimizados para YouTube e TikTok.",
    icon: <LabelOutlinedIcon />,
    category: "subtitles",
  },
  {
    id: "auto-chapters",
    title: "Capítulos Automáticos",
    description: "Marcadores de capítulos automáticos gerados por IA para vídeos longos.",
    icon: <FormatListNumberedIcon />,
    category: "subtitles",
  },
]

// ── Category metadata ──────────────────────────────────────────────────────
//
// `accent` keys map to MUI theme palette slots — used for the section
// header's icon background tint and the colored left-border on each card,
// so each section reads at a glance even when scrolling fast.

const CATEGORIES = [
  {
    id: "video",
    label: "Vídeo",
    description: "Edições visuais e estruturais para vídeos prontos.",
    icon: <VideocamOutlinedIcon />,
    accent: "info",
  },
  {
    id: "audio",
    label: "Áudio",
    description: "Voz, limpeza de ruídos e polimento da trilha sonora.",
    icon: <HeadphonesOutlinedIcon />,
    accent: "success",
  },
  {
    id: "subtitles",
    label: "Legendas e Análises",
    description: "Legendas, tradução e análises de conteúdo.",
    icon: <ClosedCaptionOutlinedIcon />,
    accent: "warning",
  },
]

// ── Components ─────────────────────────────────────────────────────────────

function ToolCard({ tool, onClick }) {
  return (
    <GlassCard sx={{ borderRadius: 2 }}>
      <CardActionArea
        onClick={onClick}
        sx={{
          p: 1.25,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 0.5, width: "100%" }}>
          <Box sx={{ color: "primary.main", display: "flex", "& svg": { fontSize: 22 } }}>
            {tool.icon}
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 700, fontSize: "0.9rem", flex: 1 }}>
            {tool.title}
          </Typography>
        </Stack>
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            lineHeight: 1.4,
            fontSize: "0.78rem",
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            WebkitLineClamp: 2,
            overflow: "hidden",
          }}
        >
          {tool.description}
        </Typography>
      </CardActionArea>
    </GlassCard>
  )
}

function CategorySection({ category, tools, onPick }) {
  return (
    <Box sx={{ mb: 2 }}>
      {/* Section header */}
      <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1, px: 0.5 }}>
        <Box sx={{
          width: 32, height: 32,
          borderRadius: 1.25,
          display: "flex", alignItems: "center", justifyContent: "center",
          bgcolor: (t) => alpha(t.palette[category.accent].main, t.palette.mode === "dark" ? 0.22 : 0.13),
          color: `${category.accent}.main`,
          "& svg": { fontSize: 20 },
        }}>
          {category.icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" alignItems="baseline" spacing={1}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, letterSpacing: -0.2 }}>
              {category.label}
            </Typography>
            <Typography variant="caption" sx={{ color: "text.disabled", fontWeight: 600 }}>
              {tools.length}
            </Typography>
          </Stack>
          <Typography variant="caption" sx={{ color: "text.secondary", display: "block", lineHeight: 1.3 }}>
            {category.description}
          </Typography>
        </Box>
      </Stack>

      {/* Grid */}
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(2, 1fr)",
            md: "repeat(3, 1fr)",
            lg: "repeat(3, 1fr)",
          },
        }}
      >
        {tools.map((t) => (
          <ToolCard key={t.id} tool={t} onClick={() => onPick(t.id)} />
        ))}
      </Box>
    </Box>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Tools() {
  useDocumentTitle("Ferramentas")
  const navigate = useNavigate()
  const pick = (id) => {
    const tool = TOOLS.find((t) => t.id === id)
    navigate(tool?.route || `/tools/${id}`)
  }

  // Hub search — a flat ranked result grid when a query is present, else the
  // categorized layout (title/description/id all match against the query).
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const matches = q
    ? TOOLS.filter((t) => [t.title, t.description, t.id].some((s) => (s || "").toLowerCase().includes(q)))
    : null

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHero
        icon={<BuildOutlinedIcon sx={{ fontSize: 22 }} />}
        title="Ferramentas"
        subtitle="Utilitários modulares para editar e aperfeiçoar seus vídeos"
      />

      {/* Body */}
      <Box sx={{ flex: 1, overflow: "auto", p: { xs: 2, md: 3 } }}>
        <Box sx={{ maxWidth: 1280, mx: "auto" }}>

          {/* Search */}
          <TextField
            fullWidth
            size="small"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar ferramentas — ex: caption, reframe, speed, translate…"
            sx={{ mb: 2.5 }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlinedIcon fontSize="small" sx={{ color: "text.secondary" }} />
                  </InputAdornment>
                ),
              },
            }}
          />

          {matches ? (
            /* Flat search results */
            matches.length ? (
              <Box>
                <Typography variant="caption" sx={{ color: "text.secondary", display: "block", mb: 1.5 }}>
                  {matches.length} {matches.length === 1 ? "ferramenta encontrada para" : "ferramentas encontradas para"} “{query.trim()}”
                </Typography>
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)" } }}>
                  {matches.map((t) => (
                    <ToolCard key={t.id} tool={t} onClick={() => pick(t.id)} />
                  ))}
                </Box>
              </Box>
            ) : (
              <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", py: 6 }}>
                Nenhuma ferramenta encontrada para “{query.trim()}”. Tente “legenda”, “áudio”, “corte” ou “traduzir”.
              </Typography>
            )
          ) : (
            <>
              {/* Categories */}
              {CATEGORIES.map((cat, i) => {
                const tools = TOOLS.filter((t) => t.category === cat.id)
                if (!tools.length) return null
                return (
                  <Box key={cat.id}>
                    <CategorySection category={cat} tools={tools} onPick={pick} />
                    {i < CATEGORIES.length - 1 && (
                      <Divider sx={{ mb: 2, opacity: 0.5 }} />
                    )}
                  </Box>
                )
              })}
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}
