# Architecture

## Overview

The platform is split into a Next.js frontend and an Express backend with PostgreSQL and Redis as the baseline data services.

## Backend layers

- `api/`: HTTP routes, controllers, and request middleware.
- `services/`: application use cases for auth, chat, memory, RAG, agents, tools, admin, and health.
- `database/`: entities, repositories, migrations, and infra clients.
- `llm/`: provider abstractions for local models.
- `rag/`: vector store contracts, chunking, ingestion, and retrieval.
- `tools/`: modular tool contracts plus discoverable implementations.
- `agent/`: planning and execution orchestration.

## Frontend surfaces

- Chat workspace with markdown-ready assistant output.
- Memory and tool context rail.
- Admin dashboard for health, usage, and governance.
- Authentication page for the JWT flow.

## Future readiness

- Multi-agent orchestration can expand through additional planners and task buses.
- Enterprise multi-tenancy can be layered onto the current repositories and auth claims.
- Fine-tuned models can slot into the provider factory without changing the API layer.
- Autonomous workflows can evolve from the `tasks` and `tool_executions` primitives.
