# security-ai-lab

Self-hosted AI assistant platform with production-oriented scaffolding for chat, memory, retrieval, agents, and tool execution.

## Structure

```text
security-ai-lab/
  frontend/     Next.js + Tailwind dashboard and chat shell
  backend/      Express + TypeScript API, services, repositories, providers
  llm/          Local model notes and provider assets
  agents/       Agent profiles and orchestration notes
  memory/       Memory strategy docs and future policies
  rag/          Retrieval pipeline notes
  tools/        Tool catalog and contracts
  uploads/      User-uploaded source documents
  storage/      Persistent local storage
  docs/         Architecture, deployment, and operational docs
  docker/       Dockerfiles and database bootstrap assets
```

## Getting started

1. Copy `.env.example`, `backend/.env.example`, and `frontend/.env.example.local` into live env files.
2. Install dependencies with `npm install` from the repository root.
3. Start infrastructure with `docker compose up -d postgres redis`.
4. Run `npm run dev:backend` and `npm run dev:frontend`.

## Startup behavior

- Backend startup now creates runtime storage directories automatically.
- PostgreSQL readiness is checked before the API starts serving traffic.
- SQL migrations in `backend/src/database/migrations` are applied automatically on boot.
- Redis readiness is checked before the backend finishes bootstrapping.
- The backend handles `SIGINT` and `SIGTERM` with graceful shutdown of HTTP, Redis, and PostgreSQL connections.

## Current state

This repository now contains a production-grade initial skeleton:

- JWT auth flow with refresh token support.
- Chat, memory, RAG, agent, admin, and tool API domains.
- Local-model provider abstractions for Qwen, Llama, Mistral, and Gemma.
- Vector store abstraction for `pgvector` and Qdrant.
- Next.js admin and chat UI shell ready to connect to live APIs.
- Docker compose baseline for self-hosted deployment.

## RAG requirements

- TXT, PDF, and DOCX uploads are now parsed with real extraction logic.
- RAG ingestion and retrieval now use an OpenAI-compatible embeddings endpoint instead of placeholder vectors.
- Set `LOCAL_EMBEDDING_BASE_URL` and `DEFAULT_EMBEDDING_MODEL` in `backend/.env`.
- The default example assumes a local embedding model such as `nomic-embed-text`.
