<div align="center">

<img src="frontend/public/icon-192.png" alt="ViralMint" width="96" height="96" />

# ViralMint (Edição em Português)

### Pipeline completo de produção de vídeo com IA, local e focado no criador

**Descubra tendências → corte vídeos longos → gere Shorts com legendas dinâmicas → crie Motion Graphics → refine com 22 ferramentas locais.**  
Tudo no seu próprio servidor ou máquina. Use suas próprias chaves de API (BYOK). Sem intermediários SaaS. Zero telemetria.

[English](README.md) · **Português (Brasil)** · [简体中文](README.zh-CN.md) · [日本語](README.ja.md)

<br/>

<img src="docs/screenshots/clipper-bench.webp" alt="ViralMint Clip Studio — timeline de cortes com trilha de fala e prévias" width="900" />

</div>

---

## 🎯 Visão Geral do ViralMint

O **ViralMint** unifica em um único fluxo o que criadores e editores normalmente precisam fazer alternando entre dezenas de abas e programas:

1. **Scout**: Busca vídeos em alta no YouTube, TikTok e Douyin, além de monitorar tendências pelo Google Trends.
2. **Clip Studio**: Transcreve vídeos longos usando **Whisper**, identifica os momentos de maior retenção (ganchos virais) e corta em clipes prontos para publicação (formato 9:16 vertical) com legendas sincronizadas palavra por palavra.
3. **Smart Video**: Criação de vídeos a partir de roteiros em texto (*script-to-video*), combinando narração neural (**Edge TTS** com mais de 400 vozes ou ElevenLabs), vídeos de estoque do **Pexels** / **Pixabay**, legendas estilizadas e exportação automática em MP4.
4. **Motion Graphics**: Criação e renderização de títulos e animações gráficas programáticas.
5. **22 Ferramentas Modulares de Edição**: Utilitários individuais baseados em **FFmpeg** e **Whisper** para download de vídeos, recorte, reframe vertical com rastreamento facial, remoção de silêncio, realce de áudio, legendagem, tradução/dublagem, compressão, criação de GIFs, etc.
6. **Chat com Agentes Autônomos**: Um assistente conversacional que orquestra tarefas complexas e pode ser integrado diretamente a canais de mensageria (**Telegram**, **WhatsApp**, **Discord** e **Slack**).
7. **Servidor MCP Integrado**: Expõe 69 ferramentas via Model Context Protocol para uso direto com Claude Desktop, Cursor, Windsurf ou Gemini CLI.

---

## 🚀 Como Fazer o Deploy no Coolify

O ViralMint foi totalmente otimizado para deploy em 1 clique no **Coolify**, seja através de **Dockerfile** ou **Docker Compose**.

### 1. Pré-requisitos no Servidor (VPS / Instância Coolify)
- **CPU**: Mínimo 2 vCPUs (Recomendado: 4 vCPUs ou mais para transcrição rápida do Whisper e renderização de vídeo no FFmpeg).
- **Memória RAM**: Mínimo 4 GB de RAM (Recomendado: 8 GB+).
- **Armazenamento**: Mínimo 20 GB de espaço em disco (para vídeos baixados, cache de modelos e renders).
- *(Opcional)* **GPU NVIDIA**: Se o seu servidor tiver GPU configurada no Docker (NVIDIA Container Toolkit), a transcrição do Whisper e renderização de vídeo rodarão com velocidade extrema.

---

### 2. Passo a Passo de Deploy no Coolify

#### Passo A: Conectar o Repositório no Coolify
1. No painel do seu **Coolify**, clique em **+ Create New Resource** → **Application** (ou **Docker Compose**).
2. Selecione **Private Repository (GitHub App)** ou adicione as credenciais do seu GitHub.
3. Selecione o repositório privado: `seu-usuario/viralmint`.
4. Defina o branch como `main`.

#### Passo B: Escolha o Tipo de Build
Você pode optar por:
- **Opção 1 (Recomendada): Docker Compose**:
  - Coolify detectará automaticamente o arquivo `docker-compose.yml` da raiz do repositório.
- **Opção 2: Dockerfile**:
  - Selecione o método de build **Dockerfile** (o arquivo `Dockerfile` na raiz já é multi-stage e compila tanto o frontend Vite quanto o backend Python com FFmpeg e ImageMagick).

#### Passo C: Configuração de Portas e Domínio
- **Porta do Contêiner**: `16888`
- No campo **Domains** do Coolify, digite o domínio ou subdomínio desejado (ex: `https://viralmint.seudominio.com`). O Coolify cuidará automaticamente do certificado SSL (Let's Encrypt) e do proxy reverso Traefik.

#### Passo D: Volumes Persistentes (MUITO IMPORTANTE!)
Para que seus vídeos, áudios, clipes renderizados e o banco de dados SQLite (`viralmint.db`) não sejam apagados a cada atualização ou restart do contêiner, garanta os seguintes volumes no Coolify:
- `viralmint_storage:/app/storage` (Guarda o banco de dados e arquivos de mídia)
- `viralmint_cache:/root/.cache` (Guarda os modelos baixados do Whisper para não precisar baixar novamente)

Se você utilizar o `docker-compose.yml`, esses volumes já vêm definidos e configurados automaticamente!

#### Passo E: Variáveis de Ambiente no Coolify
No painel da aplicação no Coolify, acesse a aba **Environment Variables** e configure:

```ini
# Configuração de Rede e Servidor (Obrigatório no Docker)
HOST=0.0.0.0
PORT=16888
DEBUG=false
VIRALMINT_NO_BROWSER=1

# Provedor de IA (Configure ao menos um se for usar agentes e geração de texto)
# Você pode usar Anthropic, OpenAI, OpenRouter ou um servidor compatível (Ollama/LM Studio):
OPENAI_API_KEY=sua_chave_aqui
# ou
ANTHROPIC_API_KEY=sua_chave_aqui
# ou
OPENROUTER_API_KEY=sua_chave_aqui

# Para usar com Ollama dentro da mesma rede do Coolify:
# CUSTOM_AI_BASE_URL=http://ollama:11434/v1
# CUSTOM_AI_MODEL=qwen2.5:14b

# Mídia de Estoque (Para a ferramenta Smart Video - Roteiro para Vídeo)
# Recomendado pegar uma chave gratuita em https://www.pexels.com/api/
PEXELS_API_KEY=sua_chave_pexels

# Busca de Vídeos em Alta no YouTube (Opcional - Scout)
YOUTUBE_API_KEY=sua_chave_youtube_data_v3
```

> 💡 **Nota sobre chaves**: Se preferir, você não precisa definir as chaves de API nas variáveis de ambiente. Você pode adicioná-las e alterá-las a qualquer momento diretamente pela interface Web em **Configurações** (**Settings**), onde ficam salvas localmente com criptografia simétrica Fernet (AES-128-CBC).

#### Passo F: Deploy!
- Clique em **Deploy** no Coolify.
- O Coolify fará o build da imagem Docker (instalando FFmpeg, ImageMagick, dependências Python e compilando o frontend Vite).
- Em poucos minutos, o status passará para **Healthy** e você poderá abrir seu domínio!

---

## 🛠️ Catálogo das Ferramentas Integradas (Tools)

Mantivemos os nomes originais de ferramentas e tecnologias para preservar a precisão técnica e evitar termos genéricos ou confusos.

| Ferramenta | Categoria | Descrição |
|---|---|---|
| **Video Download** | Vídeo | Download direto de vídeos colando o link, com suporte a escolha de qualidade e incorporação de legendas. |
| **Clip Studio** | Vídeo | Linha do tempo visual com detecção de ganchos virais por IA e corte em Shorts verticais (9:16). |
| **Smart Video** | Vídeo | Geração de vídeo a partir de roteiro de texto, com narração neural, estoque Pexels/Pixabay e legendas automáticas. |
| **Merge Clips** | Vídeo | Concatenação de múltiplos clipes em um único vídeo com ajuste automático de aspect ratio. |
| **Transform** | Vídeo | Inversão, rotação, loop ou alteração de volume de clipes. |
| **Remove Audio** | Áudio | Extração ou remoção completa do áudio, mantendo o vídeo intocado. |
| **Compress Video** | Vídeo | Redução inteligente do tamanho do arquivo para redes sociais e limites de envio. |
| **Crop Video** | Vídeo | Recorte de enquadramento livre ou proporções fixas (1:1, 16:9, 9:16). |
| **Reframe to Vertical** | Vídeo | Conversão inteligente de formato horizontal (16:9) para vertical (9:16) com rastreamento facial. |
| **Add Watermark** | Vídeo | Aplicação de marcas d'água e logotipos com controle de posição, tamanho e opacidade. |
| **Video → GIF** | Vídeo | Conversão de clipes em GIFs de alta fidelidade com paleta de duas passagens. |
| **Speed up / Slow down** | Vídeo | Aceleração ou desaceleração de 0.25× a 4× com preservação do tom de voz. |
| **Trim / Cut** | Vídeo | Corte de precisão definindo pontos de entrada e saída. |
| **Auto-Zoom** | Vídeo | Zooms dinâmicos automáticos sincronizados com pausas e destaques da fala. |
| **Voice-over Generator** | Áudio | Narração realista com **Edge TTS** e vozes neurais a partir de texto. |
| **Enhance Audio** | Áudio | Redução de ruídos, normalização de volume e equalização vocal. |
| **Silence Remover** | Áudio/Vídeo | Corte automático de silêncios, gaguejos e pausas mortas. |
| **Music Visualizer** | Áudio | Criação de animações de waveform e barras espectrais sincronizadas com música. |
| **Add Captions** | Legendas | Aplicação de legendas dinâmicas palavra por palavra em estilos virais (estilo Hormozi/Beast). |
| **Export Subtitles** | Legendas | Transcrição local para arquivos `.srt`, `.vtt` ou texto puro. |
| **Transcript Downloader** | Legendas | Baixa legendas originais existentes em plataformas sem precisar retranscrever. |
| **Translate + Dub** | Legendas | Tradução de legendas para mais de 19 idiomas e dublagem de voz com IA. |
| **Hook Detector** | Análise | Pontuação dos primeiros 10 segundos e geração de alternativas para alta retenção. |
| **Title / Tags / Description** | Análise | Geração de metadados otimizados para SEO em YouTube, TikTok e Reels. |
| **Auto Chapters** | Legendas | Criação automática de capítulos do YouTube a partir de transcrições longas. |

---

## 💻 Executando Localmente (Sem Docker)

Se preferir testar em sua máquina antes de enviar para o Coolify:

1. **Requisitos**: Python 3.11+, Node.js 18+, FFmpeg e ImageMagick instalados no sistema.
2. **Instalação**:
   ```bash
   git clone https://github.com/matheusgcdj/viralmint.git
   cd viralmint
   python -m venv .venv
   source .venv/bin/activate  # No Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. **Execução**:
   ```bash
   python run.py
   ```
   O script cuidará da inicialização do banco SQLite, da compilação do frontend Vite e iniciará o servidor em `http://localhost:16888`.

---

## 🔒 Privacidade e Segurança

- **100% Local**: O banco de dados SQLite, Whisper e FFmpeg rodam exclusivamente no seu contêiner/servidor.
- **Criptografia Simétrica**: Todas as chaves salvas pela interface são criptografadas com Fernet (AES-128-CBC assinado com HMAC).
- **Sem Telemetria**: Nenhum dado, vídeo ou prompt é transmitido para servidores de terceiros. As requisições de IA vão diretamente do seu contêiner para o provedor que você configurar (OpenAI, Anthropic, OpenRouter ou Ollama local).
