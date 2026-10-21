# Arquitetura e Manual Operacional do ViralMint

Este documento serve como a **referência técnica, arquitetural e estratégica canônica** do ViralMint para desenvolvedores humanos e agentes de IA (Ekko Architect, Claude Strategist, Codex Engineer, DeepSeek Analyst, Qwen Media Specialist, Grok Creative, Kimi Content Analyst e CodeBuddy Publisher).

---

## 1. Visão Geral e Topologia de Infraestrutura

O **ViralMint** é uma plataforma completa de automação, mineração, produção e distribuição de vídeos curtos em alta escala para redes sociais verticais (**YouTube Shorts, TikTok, Instagram Reels e Kwai**).

```
                      +---------------------------------------+
                      |       Internet / Reverse Proxy        |
                      |       (viralmint.eumatheus.com)       |
                      +-------------------+-------------------+
                                          |
                                    [Port 80/443]
                                          |
                      +-------------------v-------------------+
                      |      Coolify Managed Container        |
                      |   (ghcr.io/matheusgcdj/viralmint)     |
                      |                                       |
                      |   +-------------------------------+   |
                      |   | Frontend (Vite / React 18)    |   |
                      |   | SPA, TailwindCSS, Radix UI    |   |
                      |   +---------------+---------------+   |
                      |                   | (API Calls / WS)  |
                      |   +---------------v---------------+   |
                      |   | Backend (FastAPI / Python 3)  |   |
                      |   | Port 8000                     |   |
                      |   +-------+---------------+-------+   |
                      |           |               |           |
                      |   +-------v----+     +----v-------+   |
                      |   | SQLite DB  |     | FFmpeg/    |   |
                      |   | & Fernet   |     | yt-dlp     |   |
                      |   +------------+     +------------+   |
                      +-------------------+-------------------+
                                          |
                               +----------v----------+
                               | Persistent Volume   |
                               | /app/storage        |
                               |  - viralmint.db     |
                               |  - .encryption_key  |
                               |  - /media & /clips  |
                               +---------------------+
```

### 1.1. Tecnologias Principais
* **Backend**: Python 3.11+, FastAPI, SQLAlchemy, Pydantic, Uvicorn.
* **Frontend**: React 18, Vite, TailwindCSS, Radix UI, Lucide Icons, React Router 6.
* **Processamento de Mídia**: FFmpeg nativo, `yt-dlp`, Whisper / Groq Whisper, OpenCV, PIL/Pillow.
* **Banco de Dados**: SQLite estruturado com WAL mode (`/app/storage/viralmint.db`).
* **Segurança e Criptografia**: Chaves de API e tokens protegidos por Fernet simétrico com chave canônica persistida em `/app/storage/.encryption_key`.
* **Deploy & CI/CD**: Docker Compose orquestrado pelo Coolify, consumindo imagem pré-compilada do GitHub Container Registry (`ghcr.io/matheusgcdj/viralmint:latest`).

---

## 2. Persistência de Dados e Segurança (BYOK)

### 2.1. Criptografia Fernet Permanente
* Implementada em `backend/core/crypto.py` com salvaguarda em `backend/core/encryption.py`.
* **Chave Mestra**: Carregada de `ENCRYPTION_KEY` do ambiente; caso ausente, gerada e salva deterministicamente no arquivo `/app/storage/.encryption_key`. Garante que redeploys e reinicializações de container preservem a integridade dos tokens OAuth e chaves BYOK.

### 2.2. Resolução de Chaves de API (Precedência)
A resolução de qualquer chave externa segue a precedência:
1. **Banco de Dados Criptografado (BYOK)**: Tabela `user_settings` (configurada via Web UI em `/settings`).
2. **Variáveis de Ambiente**: Arquivo `.env` ou variáveis injetadas no container.

Serviços suportados via BYOK:
* **LLMs**: OpenAI, Anthropic, Gemini, Groq, DeepSeek.
* **TTS / STT**: ElevenLabs, Google Cloud TTS (suporte a pool multiline de credenciais com hot-swap), Groq Whisper, OpenAI TTS, VoiceStudio local.
* **Mídias Stock**: Pexels, Pixabay.
* **Redes Sociais**: YouTube Data API & OAuth, TikTok API & OAuth, Instagram Graph API & OAuth, Kwai.

---

## 3. Módulos Funcionais e Ferramentas

### 3.1. Scout / Mineração de Conteúdo (`/scout`)
* **Objetivo**: Descobrir vídeos virais, tópicos quentes e outliers de desempenho para alimentar a esteira de conteúdo.
* **Motor Híbrido**:
  - **YouTube Data API v3**: Utiliza chaves BYOK ou credenciais OAuth do canal conectado com permissão `youtube.readonly`.
  - **yt-dlp Fast Extraction (`extract_flat: True`)**: Realiza busca direta sem visitar páginas de vídeo individuais, contornando proteções antibot e entregando 50 resultados em menos de 2 segundos.
  - **Detecção de Outliers**: Algoritmo `outlier_detection_service.py` que calcula a proporção de visualizações em relação à média histórica do canal para identificar anomalias virais.
  - **Trend Velocity**: `trend_velocity_service.py` avalia a velocidade de ganho de visualizações por hora.

### 3.2. Canais Temáticos Multi-Nicho (`/channel-profiles` & `/channels`)
* **Objetivo**: Gestão centralizada de canais por nicho de conteúdo, definindo identidade, estilo visual e distribuição.
* **Catálogo de 6 Nichos (`NICHE_PRESETS` em `backend/core/niche_presets.py`)**:
  1. `podcast_cuts` (**Cortes de Podcast**): Foco em revelações, polêmicas e lições de vida. Estilo de legenda `mrbeast`, TTS `voicestudio` (speed: 1.0, stability: 0.85).
  2. `curiosities` (**Curiosidades & Fatos Fascinantes**): Fatos surpreendentes e ciência incomum. Estilo `karaoke`, TTS `voicestudio` (speed: 0.98, pitch: -1).
  3. `finance_crypto` (**Finanças, Negócios & Cripto**): Conteúdo de autoridade e valor. Estilo `highlight`, TTS `elevenlabs` (speed: 1.02, stability: 0.90).
  4. `horror_mystery` (**Terror, Mistério & Sobrenatural**): Atmosfera pesada e imersiva. Estilo `glitch`, TTS `voicestudio` (speed: 0.93, pitch: -2, reverb: True).
  5. `productivity` (**Produtividade, Foco & Hábitos**): Dicas acionáveis e rotinas matinais. Estilo `minimal`, TTS `google` (speed: 1.05).
  6. `humor_memes` (**Humor, Memes & Situações Cotidianas**): Pacing ultrarrápido (35s-45s máx). Estilo `bold_pop`, TTS `voicestudio` (speed: 1.15, pitch: +1).

* **Wizard de Criação (3 Etapas)**:
  - **Etapa 1**: Escolha de nicho, nome do canal, persona, tom de voz e idioma.
  - **Etapa 2 (Pre-flight Gate)**: Seleção obrigatória de ao menos uma conta social conectada (`len(selected_accounts) >= 1`).
  - **Etapa 3**: Regras de automação (posts/dia, horário de postagem, stagger anti-canibalização).

### 3.3. Arquitetura Multi-Contas (`SocialAccount`)
* Suporte completo para vincular múltiplos canais por plataforma à mesma conta de usuário.
* **Tabela `social_accounts`**:
  - `platform`: `youtube`, `tiktok`, `instagram`, `kwai`.
  - `account_id`: Identificador único (ex: YouTube Channel ID `UC...`, TikTok `open_id`, Instagram `ig_user_id`).
  - `account_name`: Nome exibido do canal/perfil.
  - `access_token_encrypted`, `refresh_token_encrypted`, `token_expires_at`.
* **Gerenciamento Granular**:
  - Desconexão isolada de canais sem impactar credenciais de outros canais ou chaves de aplicação.
  - Associação seletiva de canais sociais a cada perfil temático.

### 3.4. PublishQueue & Agendamento Kanban (`/queue`)
* **Objetivo**: Fila centralizada de publicação multi-plataforma com visualização Kanban em 4 lanes: `tiktok`, `youtube`, `instagram`, `kwai`.
* **Algoritmo de Prioridade (`calculate_publication_priority`)**:
  $$\text{Priority} = (V_{\text{norm}} \times 0.4 + H_{\text{norm}} \times 0.3 + F_{\text{factor}} \times 0.3) \times 100$$
  - $V_{\text{norm}}$: Nota de viralidade normalizada (0 a 1).
  - $H_{\text{norm}}$: Nota do gancho/hook normalizada (0 a 1).
  - $F_{\text{factor}}$: Fator de frescor com decaimento exponencial $e^{-0.03 \times \text{hours}}$ (ou fixo em $0.5$ para conteúdo *evergreen*).
* **Escalonamento Anti-Canibalização por Nicho (`stagger_delays_minutes`)**:
  - **Cortes de Podcast**: TikTok $0\text{m} \rightarrow$ Shorts $+120\text{m} \rightarrow$ Reels $+240\text{m} \rightarrow$ Kwai $+360\text{m}$
  - **Curiosidades**: TikTok $0\text{m} \rightarrow$ Reels $+90\text{m} \rightarrow$ Shorts $+180\text{m} \rightarrow$ Kwai $+300\text{m}$
  - **Finanças/Cripto**: Shorts $0\text{m} \rightarrow$ Reels $+120\text{m} \rightarrow$ TikTok $+240\text{m} \rightarrow$ Kwai $+360\text{m}$ (YouTube lidera pela relevância do nicho)
  - **Terror/Mistério**: TikTok $0\text{m} \rightarrow$ Kwai $+60\text{m} \rightarrow$ Reels $+150\text{m} \rightarrow$ Shorts $+240\text{m}$
  - **Produtividade**: Shorts $0\text{m} \rightarrow$ Reels $+90\text{m} \rightarrow$ TikTok $+180\text{m} \rightarrow$ Kwai $+300\text{m}$
  - **Humor/Memes**: TikTok $0\text{m} \rightarrow$ Kwai $+45\text{m} \rightarrow$ Reels $+90\text{m} \rightarrow$ Shorts $+180\text{m}$

### 3.5. Smart Video Studio & Geração Automática (`/smart-video`)
* **Objetivo**: Criação de vídeos do zero a partir de ideias, tópicos ou roteiros estruturados.
* **Limites e Regras de Roteirização (`studio_doc.py`)**:
  - `SCENE_MAX = 18`: Máximo de 18 cenas por vídeo.
  - `LINE_MAX = 400`: Máximo de 400 caracteres por cena.
  - `MIN_SCENE_SECONDS = 1.2s`: Duração mínima por cena.
  - `HOOK_SECONDS = 2.5s`: Título visual do gancho fixado nos primeiros 2.5 segundos.
  - `HOOK_TEXT_MAX = 80`: Máximo de caracteres do gancho na tela.
* **Estrutura de Roteiro (Gancho $\rightarrow$ Desenvolvimento $\rightarrow$ CTA)**:
  - **Gancho (0-3s)**: Sem apresentações formais ou saudações; ruptura de padrão imediata com curiosidade provocativa.
  - **Desenvolvimento**: Mudanças visuais a cada 2-4 segundos; cortes de respiração e legendas dinâmicas.
  - **CTA**: Conclusão focada em engajamento (salvamento no Instagram, comentários no TikTok, inscrição no Shorts).
* **Estilos Visuais**: `cinematic`, `vlog`, `card` (citação), `educational`, `documentary`, `noir`, `neon`, `vintage`.

### 3.6. Voice Studio & TTS (`/voice-studio`)
* **Catálogo de Vozes Neurais**:
  - Vozes nativas brasileiras: Francisca, Antonio, Brenda, Donato, Elza, Fabio.
  - Controle de tom (`pitch`), velocidade (`speed`) e volume.
  - Pré-escuta instantânea de áudio.
* **VoiceStudio Local (Porta 3900)**: Servidor local com fallback transparente para nuvem.
* **Pool de Chaves Google Cloud TTS**: Balanceamento e hot-swap automático de credenciais de serviço para alta escala.

### 3.7. Clip Studio & Deduplicação de Tópicos (`/clips`)
* **Processamento de Cortes**:
  - Download via `yt-dlp` e transcrição integral com Whisper.
  - Detecção de momentos virais e autocrop facial para 9:16.
* **Filtro de Similaridade e Deduplicação (`clip_extractor.py`)**:
  - `TOPIC_DEDUP_THRESHOLD = 0.55`: Similaridade de Jaccard superior a 55% em `título + gancho + justificativa` descarta clipes redundantes do mesmo vídeo.
  - Lista de exclusão com mais de 80 stopwords para evitar falsos positivos de similaridade.
  - Pipeline em dois passos: `_remove_overlapping_clips()` (tempo) $\rightarrow$ `_dedupe_clips_by_topic()` (semântica).

### 3.8. Análise de Ganchos e Retenção
* **Hook Analysis Tool (`tool_runners.py`)**:
  - Extrai os primeiros 10 segundos de áudio, transcreve com Whisper e analisa via prompt especializado.
  - Retorna pontuação (1 a 10), veredito, problemas identificados e 3 sugestões de reescrita do gancho.
* **Feedback Loop de Desempenho (`ChannelProfile.performance_metrics`)**:
  - Rastreia `avg_retention_rate`, `best_hook_type`, `best_posting_hour` e métricas por plataforma (`performance_tracker.py`).
  - Cadência de monitoramento: a cada 2 horas nas primeiras 24h, a cada 6 horas entre o 2º e 7º dia, e diário até 30 dias.

### 3.9. Servidor MCP (`/mcp`)
* Implementação do **Model Context Protocol** permitindo que agentes externos controlem o ViralMint programaticamente.
* **Ferramentas Expostas**:
  - `viralmint_scout`: Execução de buscas e extração de vídeos virais.
  - `viralmint_create_video`: Disparo de pipelines de geração de vídeo.
  - `viralmint_queue_status`: Consulta e despacho de itens da fila de postagem.
  - `viralmint_list_channels`: Consulta de canais temáticos e contas sociais vinculadas.

---

## 4. Estrutura do Banco de Dados (SQLite)

| Tabela | Responsabilidade |
| :--- | :--- |
| `user_settings` | Chaves de API BYOK criptografadas, configurações de LLM, STT e TTS. |
| `social_accounts` | Contas conectadas (YouTube, TikTok, Instagram, Kwai) com tokens Fernet. |
| `channel_profiles` | Perfis de canais temáticos (nicho, persona, estilo, contas associadas, rotatividade de hooks). |
| `publish_queue` | Itens da esteira de postagem (status, plataforma, mídia, agendamento, retentativas, prioridade). |
| `scout_results` | Vídeos minerados com métricas, views, autor, tags e notas de outlier. |
| `downloaded_videos` | Vídeos baixados no storage para processamento ou geração de cortes. |
| `video_projects` | Projetos do Smart Video Studio com roteiro, áudios e configurações de render. |
| `generated_videos` | Vídeos finalizados com notas de gancho (`clip_hook_score`, `clip_hook_type`). |
| `video_metrics` | Métricas históricas coletadas por vídeo (views, watch time, CTR, shares). |
| `chat_sessions` | Histórico de conversas com agentes de IA no chat do app. |

---

## 5. Endpoints Principais da API REST

### Configurações & Conexões Sociais
* `GET /api/settings` — Retorna configurações ativas e lista de contas conectadas (`connected_accounts`).
* `PUT /api/settings` — Atualiza chaves de API BYOK e preferências.
* `GET /api/settings/youtube-auth` — Inicia fluxo OAuth do YouTube com seleção forçada de canal.
* `GET /api/settings/youtube-callback` — Callback do Google OAuth para troca de tokens e registro do canal.
* `POST /api/settings/kwai-account` — Cadastra conta/canal do Kwai com webhook opcional.
* `DELETE /api/settings/social-account/{account_id}` — Remove conta social específica.

### Canais Temáticos & Presets
* `GET /api/channel-profiles/presets` — Retorna catálogo de nichos (`NICHE_PRESETS`) e configurações padrão.
* `GET /api/channel-profiles` — Lista todos os canais temáticos criados.
* `POST /api/channel-profiles` — Cria um novo canal temático vinculado a contas sociais.
* `GET /api/channel-profiles/{profile_id}` — Detalhes e métricas de um canal temático.
* `PUT /api/channel-profiles/{profile_id}` — Atualiza configurações e regras de automação.
* `DELETE /api/channel-profiles/{profile_id}` — Remove um canal temático.

### Fila de Publicação (PublishQueue)
* `GET /api/publish-queue` — Retorna itens da fila organizados por plataforma e status.
* `POST /api/publish-queue` — Adiciona novo vídeo à fila com regras de agendamento/stagger.
* `POST /api/publish-queue/{item_id}/publish-now` — Força despacho imediato do item.
* `DELETE /api/publish-queue/{item_id}` — Cancela publicação agendada.

### Scout & Mineração
* `POST /api/scout/search` — Dispara busca de vídeos virais por palavra-chave ou nicho.
* `GET /api/scout/results` — Lista resultados da busca com filtros de engajamento e métricas.

### Voice Studio & Vozes
* `GET /api/settings/voice-studio/status` — Status do servidor local VoiceStudio.
* `GET /api/settings/voice-studio/voices` — Catálogo completo de vozes neurais brasileiras.
* `POST /api/tts/preview` — Gera amostra de áudio para pré-escuta de texto e voz.

---

## 6. Diretrizes para Agentes Colaboradores

1. **Ao criar automações de canais**: Sempre certifique-se de que o usuário possui ao menos uma conta social conectada (`len(selected_accounts) >= 1`).
2. **Ao agendar publicações**: Utilize o escalonamento específico do nicho (`stagger_delays_minutes`) para preservar o alcance orgânico e evitar penalidades de conteúdo duplicado.
3. **Ao minerar conteúdo**: Priorize buscas com `extract_flat: True` ou autenticadas via YouTube API para evitar penalidades de taxa ou desafios antibot.
4. **Ao manipular credenciais**: Nunca exponha chaves Fernet ou tokens em texto plano; use os métodos de criptografia centralizados em `backend/core/crypto.py`.
5. **Ao gerar roteiros**: Respeite os limites do Smart Video (`SCENE_MAX = 18`, `HOOK_SECONDS = 2.5s`) e aplique a estrutura Gancho $\rightarrow$ Desenvolvimento $\rightarrow$ CTA adaptada à plataforma de destino.
