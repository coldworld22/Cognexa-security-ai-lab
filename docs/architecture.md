# Architecture

## Overview

The platform is split into a Next.js frontend and an Express backend with PostgreSQL and Redis as the baseline data services.

## Backend layers

- `api/`: HTTP routes, controllers, and request middleware.
- `services/`: application use cases for auth, chat, memory, RAG, agents, tools, admin, health, passive security review, and authorized active testing.
- `database/`: entities, repositories, migrations, and infra clients.
- `policy/`: AI governance types and policy inference helpers used by the policy engine.
- `llm/`: provider abstractions for local models.
- `rag/`: vector store contracts, chunking, ingestion, and retrieval.
- `tools/`: modular tool contracts plus discoverable implementations.
- `agent/`: planning and execution orchestration.

## AI governance path

- `Authentication` establishes the user identity and current workspace.
- `AuthorizationService` applies RBAC before any protected feature path.
- `PolicyService` evaluates scoped AI governance rules before model or tool execution.
- `ToolExecutionService` enforces policy decisions before filesystem, web, and database tools run.
- `LLMService` enforces policy decisions before routing requests to model providers.
- `policy_audit_logs` captures the final decision for every evaluated AI action.
- Authorized active testing adds hostname ownership verification, same-origin safety checks, read-only HTTP method guardrails, bounded parallel module execution, adaptive backoff on rate-limited responses, in-run probe caching, prioritized module scheduling, mid-run follow-up module expansion when findings justify it, campaign-style reporting, and per-probe audit events before any active request is sent.

## Frontend surfaces

- Chat workspace with markdown-ready assistant output.
- Memory and tool context rail.
- Admin dashboard for health, usage, and governance.
- Admin consoles for LAN discovery, passive website security scanning, authorized active testing, and governance.
- Authentication page for the JWT flow.

## Future readiness

- Multi-agent orchestration can expand through additional planners and task buses.
- Enterprise multi-tenancy can be layered onto the current repositories and auth claims.
- Fine-tuned models can slot into the provider factory without changing the API layer.
- Autonomous workflows can evolve from the `tasks` and `tool_executions` primitives.
- The authorized testing execution engine can graduate from in-memory optimization state to Redis-backed cross-run caching, scheduled retests, and webhook-driven CI/CD automation without changing the external admin API shape.
