# Deployment

## Local

1. Start PostgreSQL, Redis, and Ollama with Docker Compose.
2. Start backend and frontend workspaces.

The backend now applies migrations automatically during startup and retries dependency checks using the startup retry env vars in `backend/.env.example`.
For live chat, make sure the Ollama service has the configured model available. With the default config:

```powershell
docker compose up -d postgres redis ollama
docker exec security-ai-lab-ollama ollama pull qwen2.5-coder
```

For live RAG, also pull the embedding model used by `DEFAULT_EMBEDDING_MODEL`:

```powershell
docker exec security-ai-lab-ollama ollama pull nomic-embed-text
```

## Containers

- Backend image builds TypeScript into `dist/`.
- Frontend image builds Next.js in standalone mode.
- PostgreSQL uses the `pgvector` image so vector search is available at bootstrap.
- Docker Compose now uses dependency health checks so the frontend waits for a healthy backend and the backend waits for healthy PostgreSQL, Redis, and Ollama instances.
- The backend now parses `.txt`, `.pdf`, and `.docx` documents during ingestion and stores real embedding vectors in PostgreSQL `pgvector`.
