# Deployment

## Local

1. Start PostgreSQL and Redis with Docker Compose.
2. Apply `backend/src/database/migrations/0001_initial_schema.sql`.
3. Start backend and frontend workspaces.

## Containers

- Backend image builds TypeScript into `dist/`.
- Frontend image builds Next.js in standalone mode.
- PostgreSQL uses the `pgvector` image so vector search is available at bootstrap.
