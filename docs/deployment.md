# Deployment

## Local

1. Start PostgreSQL locally.
2. Use `REDIS_URL=memory://local` in `backend/.env` unless you want a real Redis instance. This local mode now persists runtime keys under `storage/runtime/local-kv.json`, so refresh tokens survive backend restarts.
3. Start Ollama locally if you want local model replies and embeddings.
4. Start backend and frontend workspaces.

The backend now applies migrations automatically during startup and retries dependency checks using the startup retry env vars in `backend/.env.example`.
For live chat, make sure the Ollama service has the configured model available. With the default config:

```powershell
ollama pull qwen2.5-coder
```

For live RAG, also pull the embedding model used by `DEFAULT_EMBEDDING_MODEL`:

```powershell
ollama pull nomic-embed-text
```

If your PostgreSQL instance does not include `pgvector`, the backend still starts but document upload and retrieval stay disabled until `pgvector` is installed.

On Windows, `npm run startup:install` adds a Startup-folder launcher that reruns `scripts/start-dev.ps1` when you sign in, so the local stack comes back automatically after a reboot.

## Docker Desktop

Docker Desktop on Windows still depends on WSL2 and virtualization. If virtualization is disabled or `WSL2` cannot start, use the native local path above instead of Docker.

## Containers

- Backend image builds TypeScript into `dist/`.
- Frontend image builds Next.js in standalone mode.
- PostgreSQL uses the `pgvector` image so vector search is available at bootstrap.
- Docker Compose now uses dependency health checks so the frontend waits for a healthy backend and the backend waits for healthy PostgreSQL, Redis, and Ollama instances.
- The backend now parses `.txt`, `.pdf`, and `.docx` documents during ingestion and stores real embedding vectors in PostgreSQL `pgvector`.
