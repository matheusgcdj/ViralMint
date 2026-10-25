# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (c) 2025-2026 ViralMint Contributors
"""Strategic presets and dynamic hook banks for multi-niche automated channel profiles."""
import math
from typing import Dict, Any, List

NICHE_PRESETS: Dict[str, Dict[str, Any]] = {
    "podcast_cuts": {
        "time_window_days": 4,
        "video_duration": "long",
        "label": "Cortes de Podcast",
        "description": "Cortes rápidos de alto impacto, opiniões fortes, revelações e polêmicas.",
        "voice_provider": "voicestudio",
        "voice_settings": {
            "speed": 1.0,
            "pitch": 0,
            "reverb": False,
            "stability": 0.85,
        },
        "caption_style": "mrbeast",
        "schedule_cron": "0 12,18 * * *",
        "default_slots": [
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "12:00"},
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "18:00"},
        ],
        "stagger_delays_minutes": {
            "tiktok": 0,
            "youtube": 120,
            "instagram": 240,
            "kwai": 360,
        },
        "hook_bank": [
            "O que ele revelou sobre {tema} vai chocar você...",
            "Ele não esperava que essa pergunta fosse feita ao vivo!",
            "Essa é a verdade nua e crua sobre {tema} que ninguém admite.",
            "Preste muita atenção no que ele falou sobre {tema}.",
            "A resposta dele sobre {tema} deixou todo mundo em silêncio.",
        ],
        "platform_overrides": {
            "tiktok": {"max_duration_sec": 58, "hashtag_strategy": "niche", "first_frame_hook": True},
            "youtube": {"max_duration_sec": 59, "hashtag_strategy": "mixed", "end_screen": True},
            "instagram": {"max_duration_sec": 60, "hashtag_strategy": "broad", "cover_frame_sec": 3},
            "kwai": {"max_duration_sec": 57, "hashtag_strategy": "trending", "first_frame_hook": True},
        },
    },
    "curiosities": {
        "time_window_days": 5,
        "video_duration": "short",
        "label": "Curiosidades & Fatos Fascinantes",
        "description": "Fatos surpreendentes, mistérios da ciência, história oculta e 'você sabia'.",
        "voice_provider": "voicestudio",
        "voice_settings": {
            "speed": 0.98,
            "pitch": -1,
            "reverb": False,
            "stability": 0.80,
        },
        "caption_style": "karaoke",
        "schedule_cron": "0 10,14,19 * * *",
        "default_slots": [
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "10:00"},
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "14:00"},
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "19:00"},
        ],
        "stagger_delays_minutes": {
            "tiktok": 0,
            "instagram": 90,
            "youtube": 180,
            "kwai": 300,
        },
        "hook_bank": [
            "Você sabia que {fato}? Quase ninguém sabe disso!",
            "Isso é considerado proibido em mais de 20 países...",
            "A verdadeira razão pela qual {tema} existe é assustadora.",
            "Se você acha que {tema} funciona assim, você viveu enganado.",
            "O que os cientistas acabaram de descobrir sobre {tema} muda tudo.",
        ],
        "platform_overrides": {
            "tiktok": {"max_duration_sec": 58, "hashtag_strategy": "niche", "first_frame_hook": True},
            "youtube": {"max_duration_sec": 59, "hashtag_strategy": "mixed", "end_screen": True},
            "instagram": {"max_duration_sec": 60, "hashtag_strategy": "broad", "cover_frame_sec": 2},
            "kwai": {"max_duration_sec": 57, "hashtag_strategy": "trending", "first_frame_hook": True},
        },
    },
    "finance_crypto": {
        "time_window_days": 2,
        "video_duration": "any",
        "label": "Finanças, Negócios & Cripto",
        "description": "Análises diretas, inteligência financeira, alertas de mercado e estratégias de riqueza.",
        "voice_provider": "elevenlabs",
        "voice_settings": {
            "speed": 1.02,
            "pitch": 0,
            "reverb": False,
            "stability": 0.90,
        },
        "caption_style": "highlight",
        "schedule_cron": "0 8,17 * * 1-5",
        "default_slots": [
            {"days": ["mon", "tue", "wed", "thu", "fri"], "time": "08:00"},
            {"days": ["mon", "tue", "wed", "thu", "fri"], "time": "17:00"},
        ],
        "stagger_delays_minutes": {
            "youtube": 0,
            "instagram": 120,
            "tiktok": 240,
            "kwai": 360,
        },
        "hook_bank": [
            "Se você tem dinheiro em {tema}, pare o que está fazendo e veja isso.",
            "Ninguém no mercado financeiro quer que você entenda essa regra de {tema}.",
            "A maior transferência de riqueza da década está acontecendo em {tema}.",
            "Como transformar {valor} usando essa estratégia ignorada de {tema}.",
            "O erro fatal que 99% das pessoas cometem ao investir em {tema}.",
        ],
        "platform_overrides": {
            "tiktok": {"max_duration_sec": 58, "hashtag_strategy": "niche", "first_frame_hook": True},
            "youtube": {"max_duration_sec": 59, "hashtag_strategy": "mixed", "end_screen": True},
            "instagram": {"max_duration_sec": 60, "hashtag_strategy": "broad", "cover_frame_sec": 3},
            "kwai": {"max_duration_sec": 57, "hashtag_strategy": "trending", "first_frame_hook": True},
        },
    },
    "horror_mystery": {
        "time_window_days": 5,
        "video_duration": "any",
        "label": "Terror, Mistério & Sobrenatural",
        "description": "Casos reais sem solução, relatos macabros, found footage e lendas urbanas sombrias.",
        "voice_provider": "voicestudio",
        "voice_settings": {
            "speed": 0.93,
            "pitch": -2,
            "reverb": True,
            "stability": 0.70,
        },
        "caption_style": "glitch",
        "schedule_cron": "0 21,23 * * *",
        "default_slots": [
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "21:00"},
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "23:00"},
        ],
        "stagger_delays_minutes": {
            "tiktok": 0,
            "kwai": 60,
            "instagram": 150,
            "youtube": 240,
        },
        "hook_bank": [
            "Isso aconteceu às {hora} e até hoje ninguém consegue explicar...",
            "NÃO assista isso sozinho — o que encontraram em {local} é perturbador.",
            "Essa câmera de segurança gravou algo que não deveria existir.",
            "O áudio recuperado desse caso de {tema} vai tirar o seu sono.",
            "Eles pensavam que estavam sozinhos em {local}, até que olharam para trás.",
        ],
        "platform_overrides": {
            "tiktok": {"max_duration_sec": 58, "hashtag_strategy": "niche", "first_frame_hook": True},
            "youtube": {"max_duration_sec": 59, "hashtag_strategy": "mixed", "end_screen": True},
            "instagram": {"max_duration_sec": 60, "hashtag_strategy": "niche", "cover_frame_sec": 1},
            "kwai": {"max_duration_sec": 57, "hashtag_strategy": "trending", "first_frame_hook": True},
        },
    },
    "productivity": {
        "time_window_days": 7,
        "video_duration": "any",
        "label": "Produtividade, Foco & Hábitos",
        "description": "Otimização de rotina, hacks mentais, disciplina estoica e métodos ágeis.",
        "voice_provider": "google",
        "voice_settings": {
            "speed": 1.05,
            "pitch": 0,
            "reverb": False,
            "stability": 0.85,
        },
        "caption_style": "minimal",
        "schedule_cron": "0 7,12 * * 1-5",
        "default_slots": [
            {"days": ["mon", "tue", "wed", "thu", "fri"], "time": "07:00"},
            {"days": ["mon", "tue", "wed", "thu", "fri"], "time": "12:00"},
        ],
        "stagger_delays_minutes": {
            "youtube": 0,
            "instagram": 90,
            "tiktok": 180,
            "kwai": 300,
        },
        "hook_bank": [
            "Em apenas 30 segundos, esse hábito de {tema} vai dobrar seu foco.",
            "Pare de perder tempo com {tema} e aplique esta regra simples agora.",
            "O método militar de disciplina que resolve procrastinação em {tema}.",
            "Como eu organizo minha rotina para produzir em 3 horas o equivalente a um dia.",
            "Essa técnica psicológica vai fazer você dominar {tema} sem esforço.",
        ],
        "platform_overrides": {
            "tiktok": {"max_duration_sec": 58, "hashtag_strategy": "niche", "first_frame_hook": True},
            "youtube": {"max_duration_sec": 59, "hashtag_strategy": "mixed", "end_screen": True},
            "instagram": {"max_duration_sec": 60, "hashtag_strategy": "broad", "cover_frame_sec": 2},
            "kwai": {"max_duration_sec": 57, "hashtag_strategy": "trending", "first_frame_hook": True},
        },
    },
    "humor_memes": {
        "time_window_days": 1,
        "video_duration": "short",
        "label": "Humor, Memes & Situações Cotidianas",
        "description": "Comédia rápida, reações exageradas, situações cômicas e identificação imediata.",
        "voice_provider": "voicestudio",
        "voice_settings": {
            "speed": 1.15,
            "pitch": 1,
            "reverb": False,
            "stability": 0.65,
        },
        "caption_style": "bold_pop",
        "schedule_cron": "0 12,15,19,22 * * *",
        "default_slots": [
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "12:00"},
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "15:00"},
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "19:00"},
            {"days": ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], "time": "22:00"},
        ],
        "stagger_delays_minutes": {
            "tiktok": 0,
            "kwai": 45,
            "instagram": 90,
            "youtube": 180,
        },
        "hook_bank": [
            "Eu duvido você não se identificar com isso sobre {tema}...",
            "A audácia dessa pessoa ao tentar explicar {tema} me quebrou totalmente!",
            "Pov: quando você tenta fingir que entende de {tema}.",
            "Alguém precisa parar essa pessoa imediatamente kkkk",
            "Minha reação sincera quando vejo alguém falando sobre {tema}.",
        ],
        "platform_overrides": {
            "tiktok": {"max_duration_sec": 35, "hashtag_strategy": "trending", "first_frame_hook": True},
            "youtube": {"max_duration_sec": 45, "hashtag_strategy": "mixed", "end_screen": False},
            "instagram": {"max_duration_sec": 40, "hashtag_strategy": "broad", "cover_frame_sec": 1},
            "kwai": {"max_duration_sec": 35, "hashtag_strategy": "trending", "first_frame_hook": True},
        },
    },
}


def calculate_publication_priority(
    virality_score: float,
    hook_score: float,
    hours_since_trending: float = 0.0,
    is_evergreen: bool = False,
) -> float:
    """Calculate dynamic algorithmic publication priority (0 to 100).

    Uses exponential freshness decay over a 48h window.
    """
    v_norm = max(0.0, min(1.0, (virality_score or 5.0) / 10.0))
    h_norm = max(0.0, min(1.0, (hook_score or 5.0) / 10.0))

    if is_evergreen:
        freshness_factor = 0.5
    else:
        freshness_factor = max(0.1, math.exp(-0.03 * max(0.0, hours_since_trending)))

    priority = (v_norm * 0.4 + h_norm * 0.3 + freshness_factor * 0.3) * 100.0
    return round(priority, 2)
