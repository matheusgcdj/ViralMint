# Arquitetura e Manual Operacional do ViralMint

Este documento serve como a **referência técnica e arquitetural canônica** do ViralMint para desenvolvedores humanos e agentes de IA (Ekko Architect, Claude Strategist, Codex Engineer, DeepSeek Analyst, Qwen Media Specialist, Grok Creative, Kimi Content Analyst e CodeBuddy Publisher).

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
* **TTS / STT**: ElevenLabs, Google Cloud TTS (suporte a pool multiline de credenciais), Groq Whisper, OpenAI TTS, VoiceStudio.
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
* **Presets de Nicho (`NICHE_PRESETS`)**:
  1. **Cortes de Podcast**: Foco em histórias de impacto, debates acalorados e lições de vida.
  2. **Curiosidades**: Fatos surpreendentes, ciência estranha, "você sabia?".
  3. **Finanças / Crypto**: Dicas financeiras, análises de mercado, investimentos rápidos.
  4. **Terror / Mistério**: Contos sombrios, lendas urbanas, mistérios reais não resolvidos.
  5. **Produtividade / Hacks**: Dicas práticas de rotina, organização e biohacking.
  6. **Humor / Memes**: Situações cotidianas exageradas, sketches e dublagens cômicas.
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
* **Objetivo**: Fila centralizada de publicação multi-plataforma com visualização Kanban.
* **4 Lanes Especializadas**:
  1. `tiktok`: Publicação direta via TikTok Content Posting API.
  2. `youtube`: Publicação via YouTube Data API v3 (Upload de Shorts).
  3. `instagram`: Publicação via Instagram Graph API (Reels Container & Publish).
  4. `kwai`: Publicação via conector Kwai / Webhook autenticado.
* **Escalonamento Anti-Canibalização (Staggering)**:
  - Distribuição temporal automática para impedir competição entre algoritmos no mesmo instante:
    - **TikTok**: Imediato ($T+0$)
    - **YouTube Shorts**: $+120$ minutos ($T+2\text{h}$)
    - **Instagram Reels**: $+240$ minutos ($T+4\text{h}$)
    - **Kwai**: $+360$ minutos ($T+6\text{h}$)
* **Modos de Operação**:
  - Despacho manual imediato ("Postar Agora").
  - Agendamento automático com horários de pico por nicho.
  - Retentativas automáticas em falhas de API transitórias.

### 3.5. Smart Video Studio & Geração Automática (`/smart-video`)
* **Objetivo**: Criação de vídeos do zero a partir de ideias, roteiros ou prompts.
* **Fluxo do Pipeline**:
  1. **Roteirização por IA**: Gera gancho inicial (0-3s), desenvolvimento dinâmico e chamada para ação (CTA).
  2. **Voz e Narração**: Gera áudio neural via TTS selecionado.
  3. **Alinhamento e Legendas**: Transcrição Whisper com timestamps palavra por palavra (`caption_timing.py`).
  4. **Seleção de B-Roll**: Busca automática de vídeos stock no Pexels/Pixabay contextualmente alinhados ao texto.
  5. **Composição e Renderização**: Montagem em formato vertical 9:16 com transições, música de fundo e efeitos sonoros (SFX).

### 3.6. Voice Studio & TTS (`/voice-studio`)
* **Catálogo de Vozes Neurais**:
  - Vozes nativas brasileiras de alta fidelidade (Francisca, Antonio, Brenda, Donato, Elza, Fabio).
  - Controle de tom (`pitch`), velocidade (`speed`) e volume.
  - Pré-escuta instantânea de amostras.
* **VoiceStudio Local (Porta 3900)**: Suporte a container/servidor local com fallback transparente para nuvem.
* **Pool de Chaves Google Cloud TTS**: Balanceamento e hot-swap automático de credenciais de serviço para alta escala.

### 3.7. Clip Studio / Cortes de Podcast (`/clips`)
* **Entrada**: URL do YouTube ou upload de vídeo longo.
* **Processamento**:
  - Download em alta qualidade via `yt-dlp`.
  - Transcrição completa com Whisper.
  - Análise semântica por LLM para localizar momentos virais de pico (humor, revelação, controvérsia).
  - Recorte inteligente com auto-reframe para vertical 9:16 (foco no rosto do locutor ativo).
  - Queima de legendas animadas em destaque (*karaoke captioning*).

### 3.8. Servidor MCP (`/mcp`)
* Implementação do **Model Context Protocol** permitindo que agentes externos (Claude Desktop, Cursor, Agentes Ekko) controlem o ViralMint programaticamente.
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
| `channel_profiles` | Perfis de canais temáticos (nicho, persona, estilo, contas associadas). |
| `publish_queue` | Itens da esteira de postagem (status, plataforma, mídia, agendamento, retentativas). |
| `scout_results` | Vídeos minerados com métricas, views, autor, tags e notas de outlier. |
| `downloaded_videos` | Vídeos baixados no storage para processamento ou geração de cortes. |
| `video_projects` | Projetos do Smart Video Studio com roteiro, áudios e configurações de render. |
| `generated_videos` | Vídeos finalizados prontos para download ou despacho na fila. |
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

### Canais Temáticos
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
2. **Ao agendar publicações**: Utilize a função de escalonamento padrão (TikTok $\rightarrow$ Shorts $+2$h $\rightarrow$ Reels $+4$h $\rightarrow$ Kwai $+6$h) para preservar o alcance orgânico.
3. **Ao minerar conteúdo**: Priorize buscas com `extract_flat: True` ou autenticadas via YouTube API para evitar penalidades de taxa ou desafios antibot.
4. **Ao manipular credenciais**: Nunca exponha chaves Fernet ou tokens em texto plano; use os métodos de criptografia centralizados em `backend/core/crypto.py`.
