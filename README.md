# Cognexa Security AI Lab

Cognexa Security AI Lab is a self-hosted, local-first AI assistant platform for security operations and engineering workflows. It combines chat, retrieval-augmented generation (RAG), memory, agent orchestration, and tool execution behind a Next.js frontend and a TypeScript/Express backend.

## Highlights

- Local-first deployment with Ollama as the default model and embedding runtime
- Chat workspace and admin surfaces built with Next.js 15 and React 19
- JWT authentication with access and refresh token flows
- Document ingestion for `.txt`, `.pdf`, and `.docx` sources
- Retrieval backed by PostgreSQL `pgvector`, with optional Qdrant support
- Redis-backed runtime services, startup health checks, and graceful shutdown handling
- Provider abstractions for Qwen, Llama, Mistral, and Gemma-family models

## Architecture

```text
Next.js frontend
    |
    v
Express API
    |
    +-- PostgreSQL + pgvector
    +-- Redis
    +-- Ollama / OpenAI-compatible model endpoints
    +-- Optional Qdrant vector store
```

## Quick Start

### 1. Clone and install dependencies

```bash
git clone https://github.com/coldworld22/Cognexa-security-ai-lab.git
cd Cognexa-security-ai-lab
npm install
```

### 2. Create environment files

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example.local frontend/.env.local
```

If you are using PowerShell, replace `cp` with `Copy-Item`.

### 3. Start the core services

```bash
docker compose up -d postgres redis ollama
```

### 4. Pull the default Ollama models

```bash
docker exec security-ai-lab-ollama ollama pull qwen2.5-coder
docker exec security-ai-lab-ollama ollama pull nomic-embed-text
```

### 5. Run the application

```bash
npm run dev:backend
npm run dev:frontend
```

Frontend: `http://localhost:3000`  
Backend health: `http://localhost:5000/health`

## Full Docker Stack

To run the frontend and backend in containers as well:

```bash
docker compose up --build
```

The Compose stack includes `postgres`, `redis`, `ollama`, `backend`, and `frontend`.

## Configuration

Review these files before running outside the default local setup:

- `.env.example`
- `backend/.env.example`
- `frontend/.env.example.local`

The most important settings are:

- `DEFAULT_LLM_MODEL` and `LOCAL_MODEL_BASE_URL`
- `DEFAULT_EMBEDDING_MODEL` and `LOCAL_EMBEDDING_BASE_URL`
- `EMBEDDING_DIMENSION` if you switch to a different embedding model
- `POSTGRES_URL` and `REDIS_URL`
- `QDRANT_URL` if you want to use Qdrant instead of `pgvector`
- `ADMIN_LOGIN` and `ADMIN_PASSWORD` before exposing the stack outside local development

## Key Directories

```text
frontend/   Next.js dashboard, chat workspace, and admin UI
backend/    Express API, services, repositories, providers, and migrations
docs/       Architecture and deployment notes
docker/     Dockerfiles and bootstrap assets
agents/     Agent profiles and orchestration notes
memory/     Memory strategy and policy notes
rag/        Retrieval pipeline notes
tools/      Tool catalog and contracts
storage/    Persistent local storage
uploads/    Uploaded documents
```

## Documentation

- [Architecture](docs/architecture.md)
- [Deployment](docs/deployment.md)
