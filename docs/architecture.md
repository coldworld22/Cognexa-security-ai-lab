# Architecture

## Overview

Cognexa AI Lab is a local-first, self-hosted AI workspace for engineering and security teams. The current repository is built as a `Next.js` frontend backed by a `TypeScript/Express` API, with `PostgreSQL + pgvector` for persistent data and retrieval, `Redis` for token/session-adjacent runtime state, and Ollama-compatible model endpoints for LLM and embedding inference.

At a high level, the platform does four things:

1. Serves a multi-workspace AI assistant UI for chat, memory, documents, tools, and agent tasks.
2. Enforces role-based access control and policy-driven governance before sensitive AI, tool, or security actions run.
3. Grounds responses on uploaded documents through RAG and records execution state for agent workflows.
4. Exposes admin security tooling for network monitoring, Private Mode cloaking, passive website review, and authorized read-only active testing.

## Runtime Topology

```text
Browser
  |
  v
Next.js frontend (App Router)
  |
  | HTTP / SSE / browser WebSocket bootstrap
  v
Express API (/api/v1) + /health + admin network WebSocket upgrade
  |
  +-- auth middleware -> access context -> RBAC route guard
  |
  +-- controllers
        |
        v
      services
        |
        +-- PolicyService
        +-- AuthorizationService
        +-- Chat / RAG / Memory / Agent / Admin / Endpoint / Security / Private Mode services
        |
        +-- LLMService -> ProviderFactory -> Ollama/OpenAI-compatible endpoint
        +-- ToolExecutionService -> ToolRegistry -> tool implementations
        +-- RetrievalContextService -> EmbeddingService -> pgvector search
        +-- CloakingService -> Tor SOCKS/Tor control/DNS-over-HTTPS exit verification
        |
        v
      repositories
        |
        +-- PostgreSQL tables
        +-- Redis keys
```

## Frontend Surfaces

### What It Does

The frontend provides three major surfaces: the assistant workspace, the authentication boundary, and the admin console. It owns session persistence in browser storage, keeps auth cookies in sync for Next.js middleware checks, and calls backend APIs for chat, workspace, admin, and testing workflows.

### Key Files

- `frontend/app/layout.tsx`
- `frontend/app/page.tsx`
- `frontend/app/login/page.tsx`
- `frontend/app/admin/page.tsx`
- `frontend/app/admin/network-monitor/page.tsx`
- `frontend/app/admin/private-mode/page.tsx`
- `frontend/app/admin/website-scanner/page.tsx`
- `frontend/app/admin/security-review/page.tsx`
- `frontend/app/admin/authorized-testing/page.tsx`
- `frontend/app/admin/authorized-testing/runs/[runId]/page.tsx`
- `frontend/app/admin/policies/page.tsx`
- `frontend/components/app/assistant-workspace.tsx`
- `frontend/components/chat/chat-shell.tsx`
- `frontend/components/auth/home-entry.tsx`
- `frontend/components/auth/login-auth-panel.tsx`
- `frontend/components/auth/admin-entry.tsx`
- `frontend/components/auth/admin-private-mode-entry.tsx`
- `frontend/components/admin/admin-page-layout.tsx`
- `frontend/components/admin/private-mode-console.tsx`
- `frontend/lib/api.ts`
- `frontend/app/api/session/route.ts`
- `frontend/middleware.ts`

### What Problem It Solves

The frontend exists to give users one cohesive control surface instead of raw APIs. It also splits general assistant workflows from higher-risk admin workflows so that the product can enforce both UX-level and backend-level separation. Private Mode now has its own admin surface so cloaking controls, connection verification, and security-tool readiness are explicit rather than implicit.

### Input -> Process -> Output

`User action -> React/Next component -> frontend/lib/api.ts -> backend API -> parsed JSON/SSE/WebSocket event -> UI state update`

More concretely:

- Login form submits credentials to `POST /api/v1/auth/login`.
- Session tokens are stored in `localStorage` or `sessionStorage`, and mirrored into Next.js cookies through `frontend/app/api/session/route.ts`.
- The workspace bootstraps current workspace, conversations, tools, memory, providers, and tasks from the backend.
- Admin pages call specific `/admin/*` endpoints and render specialized consoles for Private Mode, scanning, policy testing, and authorized testing runs.
- The Private Mode console shows staged activation across profile save, session start, runtime sync, exit-path verification, and final security-tool readiness.
- Security admin screens load Private Mode session state first, disable action buttons when cloaking is inactive, and deep-link operators back to `/admin/private-mode`.

### Dependencies

- Backend API endpoints under `backend/src/api/routes`
- Browser storage and cookies
- Next.js middleware for route gating
- SSE for chat streaming
- WebSocket for admin network live updates

### Database Tables It Touches

The frontend has no direct database access. Indirectly, it drives nearly every major table through the backend, especially:

- `users`
- `organizations`
- `workspaces`
- `workspace_members`
- `workspace_invitations`
- `conversations`
- `messages`
- `memories`
- `files`
- `embeddings`
- `agents`
- `tasks`
- `tool_executions`
- `policies`
- `policy_rules`
- `policy_assignments`
- `policy_audit_logs`
- `monitored_endpoints`
- `managed_endpoints`
- `network_discovery_hosts`
- `private_mode_configs`
- `private_mode_sessions`
- `private_mode_exit_logs`
- `authorized_domain_verifications`
- `authorized_security_test_runs`
- `authorized_security_test_events`

### API Endpoints It Uses

Main workspace:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/auth/session`
- `PATCH /api/v1/auth/preferences`
- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`
- `POST /api/v1/workspaces/switch`
- `POST /api/v1/workspaces/current/invitations`
- `POST /api/v1/workspaces/invitations/:invitationId/accept`
- `GET /api/v1/chat/conversations`
- `POST /api/v1/chat/conversations`
- `DELETE /api/v1/chat/conversations/:conversationId`
- `GET /api/v1/chat/conversations/:conversationId/messages`
- `POST /api/v1/chat/conversations/:conversationId/messages`
- `POST /api/v1/chat/conversations/:conversationId/stream`
- `GET /api/v1/memory/context`
- `POST /api/v1/memory/preferences`
- `GET /api/v1/tools`
- `GET /api/v1/llm/providers`
- `GET /api/v1/agents/tasks`
- `GET /api/v1/agents/tasks/:taskId`
- `POST /api/v1/agents/execute`
- `GET /api/v1/endpoints`
- `POST /api/v1/endpoints`
- `POST /api/v1/endpoints/discover`
- `POST /api/v1/endpoints/refresh`

Admin:

- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/network`
- `POST /api/v1/admin/network/scan`
- `POST /api/v1/admin/network/resolve-names`
- `GET /api/v1/admin/network/ws` (WebSocket upgrade path)
- `GET /api/v1/admin/private-mode/config`
- `PUT /api/v1/admin/private-mode/config`
- `POST /api/v1/admin/private-mode/activate`
- `POST /api/v1/admin/private-mode/deactivate`
- `GET /api/v1/admin/private-mode/session`
- `POST /api/v1/admin/private-mode/verify`
- `POST /api/v1/admin/private-mode/leak-test`
- `POST /api/v1/admin/private-mode/rotate`
- `GET /api/v1/admin/private-mode/exit-logs`
- `POST /api/v1/admin/website-scan`
- `POST /api/v1/admin/security-review`
- `GET /api/v1/admin/authorized-testing/dev-mode`
- `GET /api/v1/admin/authorized-testing/verifications`
- `POST /api/v1/admin/authorized-testing/verifications`
- `POST /api/v1/admin/authorized-testing/verifications/:verificationId/check`
- `GET /api/v1/admin/authorized-testing/runs`
- `GET /api/v1/admin/authorized-testing/runs/:runId`
- `POST /api/v1/admin/authorized-testing/runs`
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:userId/role`
- `GET /api/v1/admin/policies`
- `POST /api/v1/admin/policies`
- `PUT /api/v1/admin/policies/:policyId`
- `DELETE /api/v1/admin/policies/:policyId`
- `POST /api/v1/admin/policies/evaluate`
- `GET /api/v1/admin/policies/audit-logs`
- `PUT /api/v1/admin/policies/workspace-mode`

### Real-World Example

A developer signs in, the workspace loads their current workspace and permissions, they open the Private Mode console at `/admin/private-mode`, wait for the staged connection flow to mark cloaking as active, then jump into `/admin/authorized-testing` to verify a hostname and review a saved run report from `/admin/authorized-testing/runs/:runId`.

## `api/`

### What It Does

The `api/` layer is the HTTP boundary of the backend. It validates incoming payloads, authenticates users, resolves workspace context, applies route-level RBAC, and translates HTTP requests into service calls.

### Key Files

- `backend/src/app.ts`
- `backend/src/api/routes/index.ts`
- `backend/src/api/routes/auth.routes.ts`
- `backend/src/api/routes/workspace.routes.ts`
- `backend/src/api/routes/chat.routes.ts`
- `backend/src/api/routes/memory.routes.ts`
- `backend/src/api/routes/rag.routes.ts`
- `backend/src/api/routes/agent.routes.ts`
- `backend/src/api/routes/tools.routes.ts`
- `backend/src/api/routes/llm.routes.ts`
- `backend/src/api/routes/endpoints.routes.ts`
- `backend/src/api/routes/endpoint-agents.routes.ts`
- `backend/src/api/routes/admin.routes.ts`
- `backend/src/api/controllers/*.ts`
- `backend/src/api/middlewares/auth.middleware.ts`
- `backend/src/api/middlewares/authorization.middleware.ts`
- `backend/src/api/middlewares/validate.middleware.ts`
- `backend/src/api/middlewares/error-handler.middleware.ts`

### What Problem It Solves

Without the API layer, every caller would need to understand authorization, input validation, workspace selection, and response formatting on its own. The API layer centralizes those concerns and keeps the service layer focused on business logic.

### Input -> Process -> Output

`HTTP request -> Express route -> Zod validation -> auth middleware -> route authorization -> controller -> service -> JSON/SSE response`

There are three important request patterns:

- Normal JSON request/response for most endpoints.
- Server-Sent Events for chat streaming.
- Raw WebSocket upgrade handling in `backend/src/main.ts` for admin network monitoring.

### Dependencies

- `services/`
- `authorization/`
- `policy/` indirectly through services
- `utils/async-handler.ts`
- `utils/streaming.ts`
- Express middleware stack configured in `backend/src/app.ts`

### Database Tables It Touches

The API layer does not query tables directly. Indirectly, it can reach any table depending on the service invoked.

### API Endpoints It Exposes

Health:

- `GET /health`

Public auth:

- `POST /api/v1/auth/register` (currently disabled by service logic)
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`

Authenticated auth:

- `GET /api/v1/auth/session`
- `PATCH /api/v1/auth/preferences`

Workspace:

- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces`
- `POST /api/v1/workspaces/switch`
- `POST /api/v1/workspaces/current/invitations`
- `POST /api/v1/workspaces/invitations/:invitationId/accept`

Chat:

- `GET /api/v1/chat/conversations`
- `POST /api/v1/chat/conversations`
- `DELETE /api/v1/chat/conversations/:conversationId`
- `GET /api/v1/chat/conversations/:conversationId/messages`
- `POST /api/v1/chat/conversations/:conversationId/messages`
- `POST /api/v1/chat/conversations/:conversationId/stream`

Memory:

- `GET /api/v1/memory/context`
- `POST /api/v1/memory/preferences`

RAG:

- `POST /api/v1/rag/upload`
- `POST /api/v1/rag/retrieve`

Agents:

- `GET /api/v1/agents/tasks`
- `GET /api/v1/agents/tasks/:taskId`
- `POST /api/v1/agents/execute`

Tools and LLM catalog:

- `GET /api/v1/tools`
- `GET /api/v1/llm/providers`

Endpoints and endpoint agents:

- `GET /api/v1/endpoints`
- `POST /api/v1/endpoints`
- `POST /api/v1/endpoints/discover`
- `POST /api/v1/endpoints/refresh`
- `POST /api/v1/endpoint-agents/check-in`

Admin:

- `GET /api/v1/admin/dashboard`
- `GET /api/v1/admin/private-mode/config`
- `PUT /api/v1/admin/private-mode/config`
- `POST /api/v1/admin/private-mode/activate`
- `POST /api/v1/admin/private-mode/deactivate`
- `GET /api/v1/admin/private-mode/session`
- `POST /api/v1/admin/private-mode/verify`
- `POST /api/v1/admin/private-mode/leak-test`
- `POST /api/v1/admin/private-mode/rotate`
- `GET /api/v1/admin/private-mode/exit-logs`
- `POST /api/v1/admin/website-scan`
- `POST /api/v1/admin/security-review`
- `GET /api/v1/admin/authorized-testing/verifications`
- `GET /api/v1/admin/authorized-testing/dev-mode`
- `POST /api/v1/admin/authorized-testing/verifications`
- `POST /api/v1/admin/authorized-testing/verifications/:verificationId/check`
- `GET /api/v1/admin/authorized-testing/runs`
- `GET /api/v1/admin/authorized-testing/runs/:runId`
- `POST /api/v1/admin/authorized-testing/runs`
- `POST /api/v1/admin/network/scan`
- `POST /api/v1/admin/network/resolve-names`
- `GET /api/v1/admin/network`
- `GET /api/v1/admin/users`
- `PATCH /api/v1/admin/users/:userId/role`
- `GET /api/v1/admin/policies`
- `POST /api/v1/admin/policies`
- `PUT /api/v1/admin/policies/:policyId`
- `DELETE /api/v1/admin/policies/:policyId`
- `POST /api/v1/admin/policies/evaluate`
- `GET /api/v1/admin/policies/audit-logs`
- `PUT /api/v1/admin/policies/workspace-mode`

WebSocket:

- `GET /api/v1/admin/network/ws?access_token=...` (upgrade handled in `backend/src/main.ts`)

### Real-World Example

When a user sends a streaming chat message, `chat.routes.ts` validates the body, `auth.middleware.ts` resolves the actor and workspace, `authorize(...)` confirms the `chat` permission, `ChatController.streamMessage` initializes SSE, and `ChatService.streamMessage` drives the generator that emits tokens and optional retrieval sources.

## `services/`

### What It Does

The `services/` layer contains the application use cases. This is where Cognexa decides what should happen for login, workspace provisioning, chat, memory, ingestion, tool execution, agent execution, admin actions, Private Mode cloaking, passive review, and authorized active testing.

### Key Files

Core:

- `backend/src/services/auth/auth.service.ts`
- `backend/src/services/workspace/workspace.service.ts`
- `backend/src/services/authorization/authorization.service.ts`
- `backend/src/services/policy/policy.service.ts`
- `backend/src/services/llm/llm.service.ts`
- `backend/src/services/tool-execution/tool-execution.service.ts`

Knowledge and assistant:

- `backend/src/services/chat/chat.service.ts`
- `backend/src/services/memory/memory.service.ts`
- `backend/src/services/rag/rag.service.ts`
- `backend/src/services/rag/retrieval-context.service.ts`

Automation and operations:

- `backend/src/services/agent/agent.service.ts`
- `backend/src/services/admin/admin.service.ts`
- `backend/src/services/health/health.service.ts`
- `backend/src/services/endpoints/endpoint-monitor.service.ts`
- `backend/src/services/integrations/fortigate-client.service.ts`
- `backend/src/services/private-mode/cloaking.service.ts`
- `backend/src/services/private-mode/private-mode.types.ts`

Security labs:

- `backend/src/services/website-scanner/website-scanner.service.ts`
- `backend/src/services/website-scanner/headless-browser-crawler.ts`
- `backend/src/services/security-review/security-review.service.ts`
- `backend/src/services/authorized-testing/authorized-security-testing.service.ts`
- `backend/src/services/authorized-testing/authorized-security-testing.types.ts`
- `backend/src/services/authorized-testing/verification-bypass.service.ts`

Internal future-facing orchestration:

- `backend/src/services/penetration-testing/*`

### What Problem It Solves

Services isolate business behavior from HTTP and database plumbing. That keeps controllers thin, makes tests straightforward, and lets Cognexa enforce the same rules whether a request comes from chat, admin tooling, or future automation.

### Input -> Process -> Output

`Controller input + actor -> service orchestration -> policy/RBAC checks -> repository/tool/LLM calls -> typed domain result`

Examples:

- `AuthService.login` verifies credentials, updates last login, provisions workspace context, and returns tokens.
- `ChatService.postMessage` persists the user message, gathers memory and retrieval context, runs policy-gated LLM inference, optionally falls back to search, and persists the assistant reply.
- `AuthorizedSecurityTestingService.runAuthorizedSecurityTest` first checks that Private Mode is active for the workspace, then verifies ownership state, runs a passive baseline scan, builds a plan, executes bounded read-only probe modules, records events, and persists the final report.
- `CloakingService.activatePrivateMode` persists the workspace cloaking profile, starts a cloaked session, probes for the observed exit identity, and exposes verification and circuit-rotation primitives to the admin layer.

### Dependencies

- `database/repositories`
- `policy/`
- `authorization/`
- `llm/`
- `rag/`
- `tools/`
- External systems: PostgreSQL, Redis, Ollama/OpenAI-compatible endpoints, DNS, HTTP(S), Tor SOCKS/control ports, DNS-over-HTTPS endpoints, optional Playwright browser runtime, optional FortiGate API

### Database Tables It Touches

Collectively, `services/` touches every major table:

- Identity and tenancy: `users`, `organizations`, `workspaces`, `workspace_roles`, `workspace_members`, `workspace_invitations`
- Assistant and knowledge: `conversations`, `messages`, `memories`, `files`, `embeddings`, `agents`, `tasks`, `tool_executions`
- Governance: `authorization_audit_logs`, `policies`, `policy_rules`, `policy_assignments`, `policy_audit_logs`
- Operations and security: `monitored_endpoints`, `managed_endpoints`, `network_discovery_hosts`, `private_mode_configs`, `private_mode_sessions`, `private_mode_exit_logs`, `authorized_domain_verifications`, `authorized_security_test_runs`, `authorized_security_test_events`

### API Endpoints It Exposes

Services are invoked through the API layer rather than exposing routes themselves. The mapping is:

- Auth and workspace services -> `/auth/*`, `/workspaces/*`
- Chat, memory, RAG, tools, agent services -> `/chat/*`, `/memory/*`, `/rag/*`, `/tools`, `/agents/*`
- Endpoint and admin services -> `/endpoints/*`, `/endpoint-agents/check-in`, `/admin/*`

### Real-World Example

`AdminService.runAuthorizedSecurityTest` does not probe hosts directly. Instead, it first confirms an active Private Mode session through `assertPrivateModeActiveForSecurityWork(...)`, then delegates to `AuthorizedSecurityTestingService`, which in turn uses `WebsiteScannerService`, `PolicyService`, `AuthorizationService`, run repositories, event repositories, and optionally `LLMService` to produce a persisted report.

### Service Catalog

#### AuthService

- File: `backend/src/services/auth/auth.service.ts`
- Responsibility: logs users in, refreshes tokens, updates preferences, seeds the initial admin, and issues JWTs.
- Tables: `users`
- Redis: `refresh:<jti>`
- Endpoints: `/auth/login`, `/auth/refresh`, `/auth/preferences`, `/auth/session`
- Example: user submits username/password, receives `accessToken`, `refreshToken`, current workspace, and pending invitations.

#### WorkspaceService

- File: `backend/src/services/workspace/workspace.service.ts`
- Responsibility: provisions personal organizations/workspaces, lists workspace session context, creates workspace invites, and switches current workspace.
- Tables: `organizations`, `workspaces`, `workspace_members`, `workspace_invitations`, `users`, `policy_assignments`
- Endpoints: `/workspaces/*`
- Example: a new admin signs in for the first time and automatically gets a personal organization, workspace, membership, and default workspace policy mode.

#### AuthorizationService

- File: `backend/src/services/authorization/authorization.service.ts`
- Responsibility: resolves `AccessContext`, derives permissions from role, records denied access, and caches permission context in Redis.
- Tables: `users`, `workspace_members`, `workspaces`, `authorization_audit_logs`
- Redis: `authz:user-context:*`, `authz:permissions:*`
- Endpoints: used by route and service guards across the API.

#### PolicyService

- File: `backend/src/services/policy/policy.service.ts`
- Responsibility: evaluates policy rules for AI/tool actions, lists and mutates policies, sets workspace mode, and writes audit logs.
- Tables: `policies`, `policy_rules`, `policy_assignments`, `policy_audit_logs`
- Endpoints: `/admin/policies*`

#### ChatService

- File: `backend/src/services/chat/chat.service.ts`
- Responsibility: manages conversations and messages, retrieves memory and document context, optionally fetches public webpage context, and calls the LLM.
- Tables: `conversations`, `messages`, `memories`, `embeddings`, `files`, `policy_audit_logs`, `tool_executions`
- Endpoints: `/chat/*`
- Example: a user asks a question about an uploaded PDF; chat adds memory context, injects retrieved chunks, runs the model, and stores the answer.

#### MemoryService

- File: `backend/src/services/memory/memory.service.ts`
- Responsibility: reads long-term preferences and recent short-term context, and upserts user preferences.
- Tables: `memories`, `messages`
- Endpoints: `/memory/context`, `/memory/preferences`

#### RagService and RetrievalContextService

- Files:
  - `backend/src/services/rag/rag.service.ts`
  - `backend/src/services/rag/retrieval-context.service.ts`
- Responsibility: ingest documents, parse text, chunk content, embed it, store vectors, retrieve matches, and build safe prompt context.
- Tables: `files`, `embeddings`, `policy_audit_logs`
- Endpoints: `/rag/upload`, `/rag/retrieve`

#### ToolExecutionService

- File: `backend/src/services/tool-execution/tool-execution.service.ts`
- Responsibility: lists tools with policy previews, enforces tool-level RBAC and policy, persists execution records, and runs tool implementations.
- Tables: `tool_executions`, `policy_audit_logs`
- Endpoints: `/tools`

#### AgentService

- File: `backend/src/services/agent/agent.service.ts`
- Responsibility: creates agent definitions, queues tasks, resumes queued/running tasks at startup, and persists execution state as plans progress.
- Tables: `agents`, `tasks`, `tool_executions`, `conversations`, `policy_audit_logs`
- Endpoints: `/agents/tasks`, `/agents/tasks/:taskId`, `/agents/execute`

#### EndpointMonitorService

- File: `backend/src/services/endpoints/endpoint-monitor.service.ts`
- Responsibility: maintains monitored endpoint inventory, ingests managed endpoint heartbeats, discovers local network hosts, refreshes reachability, and pushes live network events.
- Tables: `monitored_endpoints`, `managed_endpoints`, `network_discovery_hosts`
- Endpoints: `/endpoints/*`, `/endpoint-agents/check-in`, `/admin/network*`, `/admin/network/ws`

#### HealthService

- File: `backend/src/services/health/health.service.ts`
- Responsibility: probes PostgreSQL, Redis, and the local model endpoint and returns a single health snapshot.
- Tables: none
- Endpoints: `/health`, indirectly `/admin/dashboard`

#### CloakingService

- File: `backend/src/services/private-mode/cloaking.service.ts`
- Responsibility: persists workspace cloaking profiles, starts and ends active private sessions, routes governed outbound requests through Tor-backed transport when applicable, rotates circuits, resolves cloaked DNS through DoH, and records observed exit logs.
- Tables: `private_mode_configs`, `private_mode_sessions`, `private_mode_exit_logs`
- Endpoints: `/admin/private-mode/*`
- Notes:
  - `tor` and `rotating-proxy` use the Tor-backed outbound path for cloaked categories.
  - `hybrid` uses Tor for sensitive categories such as `security_research` and `vulnerability_analysis`.
  - `vpn-chain` is persisted in config and session state, but any non-Tor transport still depends on external VPN plumbing rather than an in-process tunnel orchestrator.

#### WebsiteScannerService

- File: `backend/src/services/website-scanner/website-scanner.service.ts`
- Responsibility: performs passive public website analysis, bounded same-origin crawl, browser-assisted render analysis, exposure checks, and transport/header/cookie inspection.
- Tables: no direct tables; policy evaluation writes `policy_audit_logs`
- Endpoints: `/admin/website-scan`
- Notes: when a workspace ID is present and Private Mode is active, outbound HTTP fetches and DNS resolution use `CloakingService`.

#### SecurityReviewService

- File: `backend/src/services/security-review/security-review.service.ts`
- Responsibility: converts passive scan evidence into attacker-perspective defensive findings, attack paths, remediation guidance, and optional AI commentary.
- Tables: no direct tables; policy evaluation/auditing happens through dependencies
- Endpoints: `/admin/security-review`
- Notes: this service is reachable only after `AdminService` confirms an active Private Mode session for the workspace.

#### AuthorizedSecurityTestingService

- File: `backend/src/services/authorized-testing/authorized-security-testing.service.ts`
- Responsibility: manages hostname verification, safe read-only active probes, event recording, adaptive module planning, findings validation, attack-path modeling, and final reporting.
- Tables: `authorized_domain_verifications`, `authorized_security_test_runs`, `authorized_security_test_events`, plus indirect `policy_audit_logs`
- Endpoints: `/admin/authorized-testing/*`
- Notes:
  - outbound verification fetches, safe probes, and cloaked DNS calls use `CloakingService` when it is wired into the runtime
  - `AdminService` blocks entry entirely if Private Mode is not active for the actor workspace

#### Penetration Testing Orchestrator

- Files: `backend/src/services/penetration-testing/*`
- Responsibility: provides a higher-level orchestration factory that can combine passive review, active testing, and AI planning into broader campaign logic.
- Status: initialized in the app context but not yet exposed by public routes in the current codebase.

## `database/`

### What It Does

The `database/` module owns storage contracts, migrations, repository classes, and infrastructure clients. It is responsible for turning SQL rows into typed entities and for ensuring the database schema matches the application code at startup.

### Key Files

- `backend/src/database/postgres.ts`
- `backend/src/database/redis.ts`
- `backend/src/database/migration-runner.ts`
- `backend/src/database/migrations/*.sql`
- `backend/src/database/entities/*.ts`
- `backend/src/database/repositories/*.ts`

### What Problem It Solves

Without this layer, each service would embed SQL and schema assumptions directly, making the code hard to test and evolve. The database module centralizes persistence shape, schema evolution, and entity mapping.

### Input -> Process -> Output

`Service request -> repository method -> parameterized SQL -> PostgreSQL row(s) -> entity mapping -> typed object returned to service`

For startup:

`createAppContext -> initializeRuntime -> runMigrations -> schema_migrations bookkeeping -> repositories start against known schema`

### Dependencies

- `pg`
- `redis`
- `utils/paths.ts` for migration discovery
- Entities and repositories consumed by `services/`

### Database Tables It Touches

All application tables listed in the schema section below, plus `schema_migrations`.

### API Endpoints It Exposes

None directly. It is consumed by the service layer.

### Real-World Example

`ConversationRepository.listByWorkspace(workspaceId)` returns all conversations for the current workspace, already normalized into `ConversationEntity` objects. `AuthorizedSecurityTestRunRepository.update(...)` persists the evolving report JSON for a live security run without exposing SQL to the service.

## `policy/`

### What It Does

The `policy/` module defines the governance vocabulary for AI actions: modes, categories, decisions, scope types, evaluation inputs, and default behaviors. It gives the rest of the system a common language for describing whether a request is code generation, external URL access, vulnerability analysis, or another governed action.

### Key Files

- `backend/src/policy/policy.types.ts`
- `backend/src/services/policy/policy.service.ts`
- `docs/policy-engine.md`

### What Problem It Solves

RBAC answers "is this user allowed to access this feature?" but it does not answer "should this exact AI action be allowed right now?" The policy module fills that gap by evaluating content, tool, model, URL, and scope-specific rule conditions before execution.

### Input -> Process -> Output

`PolicyEvaluationRequest -> applicable policies by scope -> rule matching -> per-category decision -> highest final decision -> audit log -> allow/warn/require_approval/deny`

### Dependencies

- `database/repositories/policy.repository.ts`
- `database/repositories/policy-audit-log.repository.ts`
- `authorization/authorization.types.ts`
- `workspaces/workspace.types.ts`

### Database Tables It Touches

- `policies`
- `policy_rules`
- `policy_assignments`
- `policy_audit_logs`

### API Endpoints It Exposes

Indirectly through admin routes:

- `GET /api/v1/admin/policies`
- `POST /api/v1/admin/policies`
- `PUT /api/v1/admin/policies/:policyId`
- `DELETE /api/v1/admin/policies/:policyId`
- `POST /api/v1/admin/policies/evaluate`
- `GET /api/v1/admin/policies/audit-logs`
- `PUT /api/v1/admin/policies/workspace-mode`

### Real-World Example

When a user tries to run a database query tool, `ToolExecutionService` classifies the action as `tool_usage` plus `database_queries`. `PolicyService` evaluates the workspace mode and any overlays, and can block the request even if the user has the general `tools` permission.

## `llm/`

### What It Does

The `llm/` module abstracts model providers behind one interface. It selects a provider implementation, lists installed models from the local Ollama-compatible runtime, runs normal completions, streams token output, and produces structured JSON responses through Zod-validated schemas.

### Key Files

- `backend/src/services/llm/llm.service.ts`
- `backend/src/llm/base-llm-provider.ts`
- `backend/src/llm/provider-factory.ts`
- `backend/src/llm/providers/openai-compatible.provider.ts`
- `backend/src/llm/providers/qwen.provider.ts`
- `backend/src/llm/providers/llama.provider.ts`
- `backend/src/llm/providers/mistral.provider.ts`
- `backend/src/llm/providers/gemma.provider.ts`

### What Problem It Solves

The app should not care whether a reply comes from Qwen, Llama, Gemma, or Mistral. The LLM module standardizes that interface and ensures policy checks happen before model selection or generation.

### Input -> Process -> Output

`Service prompt -> LLMService policy evaluation -> ProviderFactory.getProvider(...) -> provider.generate/stream/generateStructured -> text or structured object`

### Dependencies

- `policy/`
- `tools/` through `ToolExecutionService` for LLM-initiated tool calls
- External Ollama/OpenAI-compatible HTTP endpoint

### Database Tables It Touches

No direct tables. Indirectly:

- `policy_audit_logs` through `PolicyService`
- `tool_executions` if an LLM flow calls a tool

### API Endpoints It Exposes

Indirectly:

- `GET /api/v1/llm/providers`

### Real-World Example

`ChatService.postMessage` asks `LLMService.createReply(...)` for a response after memory and retrieval context are prepared. `ProviderFactory.listProviders()` hits Ollama `/api/tags`, filters to completion-capable models, and the frontend uses that to populate the provider/model selector.

## `rag/`

### What It Does

The `rag/` module ingests user documents, extracts text, chunks it, embeds it, stores vectorized chunks, and retrieves relevant chunks for later prompts. It also builds a safe prompt segment that treats retrieved document text as untrusted reference material rather than instructions.

### Key Files

- `backend/src/services/rag/rag.service.ts`
- `backend/src/services/rag/retrieval-context.service.ts`
- `backend/src/rag/ingestion/document-parser.service.ts`
- `backend/src/rag/chunking/text-chunker.ts`
- `backend/src/rag/embedding/embedding.service.ts`
- `backend/src/rag/embedding/openai-compatible-embedding-provider.ts`
- `backend/src/rag/retrieval/retrieval-engine.ts`
- `backend/src/rag/vector-stores/pgvector.store.ts`
- `backend/src/rag/vector-stores/qdrant.store.ts`

### What Problem It Solves

Models alone cannot answer questions about internal documents they have never seen. RAG gives Cognexa workspace-specific factual grounding without fine-tuning the model.

### Input -> Process -> Output

Ingestion:

`Uploaded file -> save under uploads path -> parse text -> chunk -> embed -> insert embeddings -> mark file indexed`

Retrieval:

`User query -> query embedding -> vector similarity search -> chunk matches -> safe context message + source metadata`

### Dependencies

- `database/repositories/file.repository.ts`
- `database/repositories/embedding.repository.ts`
- `policy/`
- `authorization/`
- File system storage for uploaded documents
- Embedding provider configured through the local OpenAI-compatible endpoint

### Database Tables It Touches

- `files`
- `embeddings`
- `policy_audit_logs` indirectly

### API Endpoints It Exposes

- `POST /api/v1/rag/upload`
- `POST /api/v1/rag/retrieve`

### Real-World Example

An engineer uploads a PDF runbook. `DocumentParserService` extracts the text, `TextChunker` slices it into overlapping segments, `EmbeddingService` creates vectors with the configured embedding model, and later `RetrievalContextService` injects the most relevant excerpts into chat when the user asks about that runbook.

## `tools/`

### What It Does

The `tools/` module is the controlled bridge between the assistant and deterministic operations such as file search, repository search, documentation search, calculator evaluation, read-only SQL, and web search. Tool metadata is discoverable, policy-aware, and execution is fully recorded when a task uses a tool.

### Key Files

- `backend/src/tools/base-tool.ts`
- `backend/src/tools/register-default-tools.ts`
- `backend/src/tools/registry/tool-registry.ts`
- `backend/src/tools/implementations/file-search.tool.ts`
- `backend/src/tools/implementations/repository-search.tool.ts`
- `backend/src/tools/implementations/documentation-search.tool.ts`
- `backend/src/tools/implementations/calculator.tool.ts`
- `backend/src/tools/implementations/database-query.tool.ts`
- `backend/src/tools/implementations/web-search.tool.ts`
- `backend/src/services/tool-execution/tool-execution.service.ts`

### What Problem It Solves

LLMs are weak at exact repository lookups, deterministic math, and other actions that should be auditable and reproducible. Tools let Cognexa offload those operations to code while preserving permission checks and execution history.

### Input -> Process -> Output

`Tool request -> RBAC check -> policy evaluation -> create tool_executions record -> execute tool -> update success/failure payload -> return output`

### Dependencies

- `policy/`
- `authorization/`
- `database/repositories/tool-execution.repository.ts`
- PostgreSQL for the SQL tool
- File system and repository content for search tools
- External web requests for `web-search`

### Database Tables It Touches

- `tool_executions`
- `policy_audit_logs` indirectly

### API Endpoints It Exposes

Indirectly:

- `GET /api/v1/tools`

### Real-World Example

An agent step decides it needs repository context. `AgentExecutor` asks `ToolExecutionService` to run `repository-search`, which first checks tool permission and policy, persists a `tool_executions` row, runs the tool, stores the output preview, and feeds the result back into the task trace.

## `agent/`

### What It Does

The `agent/` module provides structured task planning and controlled execution. It does not implement unconstrained autonomy; instead, it creates a small step plan, evaluates whether each step should use a tool or reasoning, records each transition, and synthesizes a final summary.

### Key Files

- `backend/src/agent/planner/task-planner.ts`
- `backend/src/agent/execution/agent-executor.ts`
- `backend/src/services/agent/agent.service.ts`
- `backend/src/database/entities/task.entity.ts`
- `backend/src/database/repositories/agent.repository.ts`
- `backend/src/database/repositories/task.repository.ts`

### What Problem It Solves

Users often want something more structured than a single chat turn but less risky than full autonomy. The agent module provides traceable, resumable task execution with explicit steps and auditable tool usage.

### Input -> Process -> Output

`Agent execute request -> permission + policy check -> create agent -> create task with plan metadata -> in-memory queue -> AgentExecutor step loop -> optional tools + reasoning log -> task summary`

Important runtime detail:

- Concurrency is currently in-memory inside `AgentService`.
- Queued/running tasks are recovered on startup by scanning persisted task state.
- There is no Redis queue yet.

### Dependencies

- `services/llm/llm.service.ts`
- `services/tool-execution/tool-execution.service.ts`
- `services/rag/retrieval-context.service.ts`
- `services/authorization/authorization.service.ts`
- `services/policy/policy.service.ts`
- `database/repositories/agent.repository.ts`
- `database/repositories/task.repository.ts`
- `database/repositories/conversation.repository.ts`

### Database Tables It Touches

- `agents`
- `tasks`
- `tool_executions`
- `conversations` for optional chat association
- `policy_audit_logs` indirectly

### API Endpoints It Exposes

- `GET /api/v1/agents/tasks`
- `GET /api/v1/agents/tasks/:taskId`
- `POST /api/v1/agents/execute`

### Real-World Example

A user asks the assistant to inspect repository code and summarize a bug area. The agent planner generates four steps, the executor uses policy-filtered tools to search the repo, stores each step trace and tool execution, then writes the final summary into the task record for later review.

## Text Data Flow Diagrams

### Standard Chat Request

```text
User
  |
  v
Next.js workspace UI
  |
  v
frontend/lib/api.ts
  |
  +-- adds Bearer access token
  +-- adds X-Workspace-Id
  v
POST /api/v1/chat/conversations/:id/messages
  |
  v
auth.middleware.ts
  |
  +-- verify JWT
  +-- resolve AccessContext from user + workspace
  v
authorize(chat)
  |
  v
ChatController
  |
  v
ChatService
  |
  +-- persist user message
  +-- read memory context
  +-- retrieve RAG context
  +-- optional website context via web-search tool
  +-- PolicyService.evaluatePolicy(...)
  +-- LLMService.createReply(...)
  |
  +-- maybe ToolExecutionService for search fallback
  v
persist assistant message
  |
  v
JSON or SSE response
  |
  v
Frontend renders reply and sources
```

### Authorized Active Testing Request

```text
Admin user
  |
  v
Authorized Testing UI
  |
  +-- GET /api/v1/admin/private-mode/session
  +-- block run button until active session exists
  |
  v
POST /api/v1/admin/authorized-testing/runs
  |
  v
auth middleware + authorize(admin_dashboard)
  |
  v
AdminController
  |
  v
AdminService.assertPrivateModeActiveForSecurityWork(...)
  |
  +-- getActiveSession(workspaceId)
  +-- reject with 403 if cloaking is inactive
  |
  v
AuthorizedSecurityTestingService.runAuthorizedSecurityTest
  |
  +-- verify hostname ownership state
  +-- PolicyService.evaluatePolicy(...)
  +-- WebsiteScannerService.scanWebsite(...) baseline
  +-- build module priorities
  +-- build plan (AI or deterministic)
  +-- execute bounded read-only probe modules
  +-- log per-probe events
  +-- adapt with follow-up modules if justified
  +-- validate findings
  +-- model attack paths
  +-- build summary and AI analysis
  +-- persist run + events
  v
GET /api/v1/admin/authorized-testing/runs/:runId
  |
  v
Frontend renders report timeline, findings, attack paths, and remediation
```

### Private Mode Activation Request

```text
Admin user
  |
  v
Private Mode UI
  |
  +-- edit config
  +-- show stage timeline
  |
  v
PUT /api/v1/admin/private-mode/config
  |
  v
POST /api/v1/admin/private-mode/activate
  |
  v
auth middleware + authorize(admin_dashboard)
  |
  v
AdminController
  |
  v
AdminService.activatePrivateMode
  |
  +-- assert admin permission
  +-- PolicyService.evaluatePolicy(...)
  +-- CloakingService.activatePrivateMode(...)
  |
  +-- persist config
  +-- end prior session if needed
  +-- create session + circuit id
  +-- determine exit identity
  |
  v
GET /api/v1/admin/private-mode/session
  |
  v
POST /api/v1/admin/private-mode/verify
  |
  v
Frontend updates stages:
  1. Save workspace profile
  2. Start cloaked session
  3. Sync runtime state
  4. Verify exit path
  5. Unlock security tools
```

## Database Schema

The database is evolved through SQL migrations in `backend/src/database/migrations`. PostgreSQL extensions `vector` and `pgcrypto` are enabled during the initial migration.

### Migration Tracking

`schema_migrations`

- `filename TEXT PRIMARY KEY`
- `applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`

Purpose:

- Tracks which SQL migrations have already run.

### Identity and Tenancy

`users`

- Columns:
  - `id UUID PRIMARY KEY`
  - `email TEXT UNIQUE NOT NULL`
  - `display_name TEXT NOT NULL`
  - `password_hash TEXT NOT NULL`
  - `role TEXT NOT NULL DEFAULT 'developer'`
  - `preferences JSONB NOT NULL DEFAULT '{}'`
  - `current_workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE SET NULL`
  - `last_login_at TIMESTAMPTZ NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- Relationships:
  - one user can own many conversations, files, memories, agents
  - one user can belong to many workspaces through `workspace_members`

`organizations`

- Columns:
  - `id UUID PRIMARY KEY`
  - `name TEXT NOT NULL`
  - `slug TEXT UNIQUE NOT NULL`
  - `billing_email TEXT NULL`
  - `billing_customer_id TEXT NULL`
  - `subscription_plan TEXT NOT NULL DEFAULT 'free'`
  - `subscription_status TEXT NOT NULL DEFAULT 'trialing'`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- Relationships:
  - one organization has many workspaces

`workspace_roles`

- Columns:
  - `code TEXT PRIMARY KEY`
  - `name TEXT NOT NULL`
  - `description TEXT NOT NULL`
  - `permissions JSONB NOT NULL DEFAULT '[]'`
  - `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
  - `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`
- Seeded values:
  - `owner`, `admin`, `member`, `viewer`

`workspaces`

- Columns:
  - `id UUID PRIMARY KEY`
  - `organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`
  - `name TEXT NOT NULL`
  - `slug TEXT NOT NULL`
  - `is_personal BOOLEAN NOT NULL DEFAULT FALSE`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- Constraints:
  - `UNIQUE (organization_id, slug)`

`workspace_members`

- Columns:
  - `id UUID PRIMARY KEY`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `role TEXT NOT NULL REFERENCES workspace_roles(code)`
  - `invited_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `joined_at TIMESTAMPTZ NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- Constraints:
  - `UNIQUE (workspace_id, user_id)`

`workspace_invitations`

- Columns:
  - `id UUID PRIMARY KEY`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `email TEXT NOT NULL`
  - `role TEXT NOT NULL REFERENCES workspace_roles(code)`
  - `token_hash TEXT NOT NULL UNIQUE`
  - `invited_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `expires_at TIMESTAMPTZ NOT NULL`
  - `accepted_at TIMESTAMPTZ NULL`
  - `accepted_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- Constraints:
  - unique pending invite index on `(workspace_id, lower(email))` where `accepted_at IS NULL`

### Assistant and Knowledge

`conversations`

- Columns:
  - `id UUID PRIMARY KEY`
  - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `title TEXT NOT NULL`
  - `model_provider TEXT NOT NULL`
  - `model_name TEXT NOT NULL`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`messages`

- Columns:
  - `id UUID PRIMARY KEY`
  - `conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `role TEXT NOT NULL`
  - `content TEXT NOT NULL`
  - `tool_name TEXT NULL`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`files`

- Columns:
  - `id UUID PRIMARY KEY`
  - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `file_name TEXT NOT NULL`
  - `mime_type TEXT NOT NULL`
  - `path TEXT NOT NULL`
  - `size_bytes BIGINT NOT NULL`
  - `status TEXT NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`embeddings`

- Columns:
  - `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
  - `file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `chunk_index INTEGER NOT NULL`
  - `content TEXT NOT NULL`
  - `vector VECTOR NOT NULL`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- Notes:
  - vector dimension is enforced operationally by the configured embedding model and vector store code

`memories`

- Columns:
  - `id UUID PRIMARY KEY`
  - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `memory_type TEXT NOT NULL`
  - `key TEXT NOT NULL`
  - `value TEXT NOT NULL`
  - `score NUMERIC NOT NULL DEFAULT 1`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- Constraints:
  - `UNIQUE (workspace_id, user_id, memory_type, key)`

`agents`

- Columns:
  - `id UUID PRIMARY KEY`
  - `user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `name TEXT NOT NULL`
  - `description TEXT NOT NULL`
  - `instructions TEXT NOT NULL`
  - `enabled_tools JSONB NOT NULL DEFAULT '[]'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`tasks`

- Columns:
  - `id UUID PRIMARY KEY`
  - `agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE`
  - `conversation_id UUID NULL REFERENCES conversations(id) ON DELETE SET NULL`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `title TEXT NOT NULL`
  - `objective TEXT NOT NULL`
  - `status TEXT NOT NULL`
  - `result TEXT NULL`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- Metadata shape in code:
  - `steps[]`
  - `executedTools[]`
  - `reasoningLog[]`
  - `retrieval`
  - `finalSummary`
  - `lastUpdatedAt`

`tool_executions`

- Columns:
  - `id UUID PRIMARY KEY`
  - `task_id UUID NULL REFERENCES tasks(id) ON DELETE SET NULL`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `tool_name TEXT NOT NULL`
  - `input_payload JSONB NOT NULL DEFAULT '{}'`
  - `output_payload JSONB NOT NULL DEFAULT '{}'`
  - `status TEXT NOT NULL`
  - `error_message TEXT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

### Governance and Audit

`authorization_audit_logs`

- Columns:
  - `id UUID PRIMARY KEY`
  - `user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `user_email TEXT NULL`
  - `user_role TEXT NULL`
  - `permission TEXT NOT NULL`
  - `layer TEXT NOT NULL`
  - `resource TEXT NOT NULL`
  - `action TEXT NOT NULL`
  - `outcome TEXT NOT NULL`
  - `reason TEXT NOT NULL`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`policies`

- Columns:
  - `id UUID PRIMARY KEY`
  - `name TEXT NOT NULL`
  - `description TEXT NOT NULL DEFAULT ''`
  - `mode TEXT NOT NULL`
  - `is_system BOOLEAN NOT NULL DEFAULT FALSE`
  - `is_active BOOLEAN NOT NULL DEFAULT TRUE`
  - `created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`policy_rules`

- Columns:
  - `id UUID PRIMARY KEY`
  - `policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE`
  - `category TEXT NOT NULL`
  - `decision TEXT NOT NULL`
  - `enabled BOOLEAN NOT NULL DEFAULT TRUE`
  - `priority INTEGER NOT NULL DEFAULT 100`
  - `description TEXT NULL`
  - `tool_names JSONB NOT NULL DEFAULT '[]'`
  - `role_scopes JSONB NOT NULL DEFAULT '[]'`
  - `workspace_role_scopes JSONB NOT NULL DEFAULT '[]'`
  - `model_patterns JSONB NOT NULL DEFAULT '[]'`
  - `conditions JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`policy_assignments`

- Columns:
  - `id UUID PRIMARY KEY`
  - `policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE`
  - `scope_type TEXT NOT NULL`
  - `scope_id UUID NULL`
  - `assignment_type TEXT NOT NULL DEFAULT 'overlay'`
  - `mode TEXT NULL`
  - `priority INTEGER NOT NULL DEFAULT 100`
  - `is_active BOOLEAN NOT NULL DEFAULT TRUE`
  - `created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`policy_audit_logs`

- Columns:
  - `id UUID PRIMARY KEY`
  - `user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `workspace_id UUID NULL REFERENCES workspaces(id) ON DELETE SET NULL`
  - `organization_id UUID NULL REFERENCES organizations(id) ON DELETE SET NULL`
  - `action TEXT NOT NULL`
  - `category TEXT NOT NULL`
  - `tool_name TEXT NULL`
  - `model TEXT NULL`
  - `provider TEXT NULL`
  - `decision TEXT NOT NULL`
  - `mode TEXT NOT NULL`
  - `policy_id UUID NULL REFERENCES policies(id) ON DELETE SET NULL`
  - `matched_rule_id UUID NULL REFERENCES policy_rules(id) ON DELETE SET NULL`
  - `scope_type TEXT NOT NULL`
  - `scope_id UUID NULL`
  - `request_context JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

### Endpoint and Network Operations

`monitored_endpoints`

- Columns:
  - `id UUID PRIMARY KEY`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `created_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `display_name TEXT NOT NULL`
  - `hostname TEXT NOT NULL`
  - `ip_address TEXT NOT NULL`
  - `subnet TEXT NOT NULL`
  - `operating_system TEXT NOT NULL`
  - `status TEXT NOT NULL`
  - `risk_level TEXT NOT NULL`
  - `last_seen_at TIMESTAMPTZ NULL`
  - `logged_in_user TEXT NULL`
  - `tags JSONB NOT NULL DEFAULT '[]'`
  - `telemetry JSONB NOT NULL DEFAULT '{"activeAlerts": 0}'`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`managed_endpoints`

- Columns:
  - `id UUID PRIMARY KEY`
  - `agent_id TEXT NOT NULL UNIQUE`
  - `display_name TEXT NOT NULL`
  - `hostname TEXT NOT NULL`
  - `ip_address TEXT NOT NULL`
  - `mac_address TEXT NULL`
  - `subnet TEXT NULL`
  - `operating_system TEXT NOT NULL`
  - `logged_in_user TEXT NULL`
  - `status TEXT NOT NULL`
  - `risk_level TEXT NOT NULL`
  - `last_seen_at TIMESTAMPTZ NOT NULL`
  - `telemetry JSONB NOT NULL DEFAULT '{"activeAlerts": 0}'`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`network_discovery_hosts`

- Columns:
  - `id UUID PRIMARY KEY`
  - `ip_address TEXT NOT NULL UNIQUE`
  - `hostname TEXT NOT NULL`
  - `mac_address TEXT NULL`
  - `vendor TEXT NULL`
  - `subnet TEXT NOT NULL`
  - `interface_address TEXT NOT NULL`
  - `status TEXT NOT NULL`
  - `resolution_source TEXT NOT NULL`
  - `resolution_cached_at TIMESTAMPTZ NULL`
  - `first_seen_at TIMESTAMPTZ NOT NULL`
  - `last_seen_at TIMESTAMPTZ NOT NULL`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

### Private Mode

`private_mode_configs`

- Columns:
  - `workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE`
  - `mode TEXT NOT NULL CHECK (mode IN ('direct', 'cloaked'))`
  - `outbound_strategy TEXT NOT NULL CHECK (outbound_strategy IN ('tor', 'vpn-chain', 'hybrid', 'rotating-proxy'))`
  - `vpn_relays JSONB NOT NULL DEFAULT '[]'::jsonb`
  - `tor_control_port INTEGER NOT NULL DEFAULT 9051`
  - `tor_socks_port INTEGER NOT NULL DEFAULT 9050`
  - `dns_over_tor BOOLEAN NOT NULL DEFAULT TRUE`
  - `exit_geography_preference JSONB NOT NULL DEFAULT '[]'::jsonb`
  - `circuit_rotation_interval INTEGER NOT NULL DEFAULT 600`
  - `tls_fingerprint_profile TEXT NOT NULL CHECK (tls_fingerprint_profile IN ('browser', 'curl', 'random'))`
  - `request_timing_jitter INTEGER NOT NULL DEFAULT 0`
  - `enabled_categories JSONB NOT NULL DEFAULT '[]'::jsonb`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- Purpose:
  - Stores the workspace-level cloaking profile that controls how governed outbound requests should be routed.

`private_mode_sessions`

- Columns:
  - `id UUID PRIMARY KEY`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `strategy TEXT NOT NULL CHECK (strategy IN ('tor', 'vpn-chain', 'hybrid', 'rotating-proxy'))`
  - `exit_nodes JSONB NOT NULL DEFAULT '[]'::jsonb`
  - `circuit_ids JSONB NOT NULL DEFAULT '[]'::jsonb`
  - `started_at TIMESTAMPTZ NOT NULL`
  - `ended_at TIMESTAMPTZ NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- Constraints:
  - unique active-session index on `workspace_id` where `ended_at IS NULL`
- Purpose:
  - Tracks the currently active cloaked session, chosen strategy, and runtime circuit identifiers shown in the admin console.

`private_mode_exit_logs`

- Columns:
  - `id UUID PRIMARY KEY`
  - `session_id UUID NOT NULL REFERENCES private_mode_sessions(id) ON DELETE CASCADE`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `exit_ip TEXT NOT NULL`
  - `exit_region TEXT NOT NULL`
  - `target_host TEXT NOT NULL`
  - `request_type TEXT NOT NULL`
  - `timestamp TIMESTAMPTZ NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
- Purpose:
  - Records observed cloaked egress metadata for outbound requests that passed through an active Private Mode session.

### Authorized Active Testing

`authorized_domain_verifications`

- Columns:
  - `id UUID PRIMARY KEY`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`
  - `requested_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `hostname TEXT NOT NULL`
  - `method TEXT NOT NULL`
  - `status TEXT NOT NULL`
  - `challenge_token TEXT NOT NULL`
  - `challenge_details JSONB NOT NULL DEFAULT '{}'`
  - `evidence JSONB NOT NULL DEFAULT '{}'`
  - `last_checked_at TIMESTAMPTZ NULL`
  - `verified_at TIMESTAMPTZ NULL`
  - `expires_at TIMESTAMPTZ NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`authorized_security_test_runs`

- Columns:
  - `id UUID PRIMARY KEY`
  - `workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE`
  - `organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`
  - `verification_id UUID NOT NULL REFERENCES authorized_domain_verifications(id) ON DELETE RESTRICT`
  - `requested_by_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL`
  - `target_url TEXT NOT NULL`
  - `hostname TEXT NOT NULL`
  - `status TEXT NOT NULL`
  - `requested_modules JSONB NOT NULL DEFAULT '[]'`
  - `guardrails JSONB NOT NULL DEFAULT '[]'`
  - `redacted_auth_profiles JSONB NOT NULL DEFAULT '[]'`
  - `baseline JSONB NOT NULL DEFAULT '{}'`
  - `plan JSONB NOT NULL DEFAULT '[]'`
  - `summary JSONB NOT NULL DEFAULT '{}'`
  - `findings JSONB NOT NULL DEFAULT '[]'`
  - `attack_paths JSONB NOT NULL DEFAULT '[]'`
  - `ai_analysis JSONB NOT NULL DEFAULT '{}'`
  - `warnings JSONB NOT NULL DEFAULT '[]'`
  - `started_at TIMESTAMPTZ NULL`
  - `completed_at TIMESTAMPTZ NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

`authorized_security_test_events`

- Columns:
  - `id UUID PRIMARY KEY`
  - `run_id UUID NOT NULL REFERENCES authorized_security_test_runs(id) ON DELETE CASCADE`
  - `event_type TEXT NOT NULL`
  - `severity TEXT NOT NULL`
  - `category TEXT NULL`
  - `message TEXT NOT NULL`
  - `metadata JSONB NOT NULL DEFAULT '{}'`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`

## Redis Usage Breakdown

Current Redis usage is intentionally narrow.

### 1. Refresh token session store

Key pattern:

- `refresh:<jti>`

Value:

- `userId`

TTL:

- derived from the refresh token expiration at issuance time

Purpose:

- allows refresh-token rotation
- lets the backend revoke the current refresh session by deleting the key during refresh

Used by:

- `backend/src/services/auth/auth.service.ts`

### 2. Authorization cache

Key patterns:

- `authz:user-context:<userId>:<workspaceId|default>`
- `authz:permissions:<userId>:<role>`

Value:

- serialized `AccessContext`
- serialized permission array

TTL:

- `AUTHZ_CACHE_TTL_SECONDS` from environment

Purpose:

- avoids repeatedly resolving user/workspace context and role permissions on every request

Used by:

- `backend/src/services/authorization/authorization.service.ts`

### 3. Health probe target

Redis is pinged by `HealthService` to report dependency status. No application payload is stored here.

### 4. What Redis is not used for today

The current codebase does not use Redis for:

- background job queues
- pub/sub event fan-out
- WebSocket presence tracking
- agent task scheduling
- private mode session state
- authorized testing probe caches

Important current behavior:

- agent task concurrency is in-memory inside `AgentService`
- network monitor live events are in-memory through `EventEmitter`
- private mode config, sessions, and exit logs are persisted in PostgreSQL instead of Redis
- authorized testing probe caching is per-run in memory, not Redis-backed

## Authentication Flow

### Backend flow

1. `POST /api/v1/auth/login` receives `{ username, password }`.
2. `AuthService.login(...)` looks up the user by login identifier and verifies the bcrypt password hash.
3. On success, the service updates `users.last_login_at`.
4. `WorkspaceService.listSessionForUser(...)` loads current workspace, all workspace memberships, and pending invitations.
5. `AuthService.issueTokens(...)` creates:
   - access token signed with `JWT_SECRET`
   - refresh token signed with `JWT_REFRESH_SECRET`
   - random `jti` for refresh-token tracking
6. The refresh token `jti` is stored in Redis as `refresh:<jti> -> userId` with TTL matching token expiration.
7. The response includes:
   - `user`
   - `currentWorkspace`
   - `workspaces`
   - `pendingInvitations`
   - `tokens`

### Request authentication flow

1. Frontend sends `Authorization: Bearer <accessToken>`.
2. `authMiddleware(...)` verifies the JWT through `AuthService.verifyAccessToken(...)`.
3. The middleware reads optional `X-Workspace-Id`.
4. `AuthorizationService.getUserAccessContext(...)` loads or caches the actor context for the requested workspace.
5. `request.auth` is populated with the actor and resolved permissions.
6. Route handlers and services use that actor for RBAC and policy checks.

### Refresh flow

1. When the frontend gets `401`, `frontend/lib/api.ts` calls `POST /api/v1/auth/refresh`.
2. `AuthService.refresh(...)` verifies the refresh token signature and reads `refresh:<jti>` from Redis.
3. If the key is missing or points at the wrong subject, refresh fails.
4. The old refresh key is deleted.
5. New access and refresh tokens are issued, and the new refresh token gets a new Redis key.
6. The frontend updates stored session tokens and mirrors them to Next.js cookies.

### Frontend session persistence

The frontend stores the session in browser storage:

- `localStorage` for persistent login
- `sessionStorage` for session-only login

The frontend also mirrors tokens into cookies through `frontend/app/api/session/route.ts` so that Next.js middleware can protect page routes before client-side hydration.

### Next.js middleware flow

1. `frontend/middleware.ts` reads the access token cookie.
2. It calls `GET /api/v1/auth/session` on the backend.
3. If the backend rejects the token, cookies are cleared and the user is redirected to `/login`.
4. For `/admin/*`, middleware checks that returned permissions include `admin_dashboard`.
5. If not, the user is redirected back to `/`.

## How the Policy Engine Evaluates a Rule Before an AI Action

This is the exact decision path used by `PolicyService.evaluatePolicy(...)`.

1. A caller prepares a `PolicyEvaluationRequest` with:
   - actor
   - action name
   - one or more categories
   - optional tool/model/provider/url/content/file/sql metadata
2. `PolicyService.ensureWorkspaceDefaults(...)` guarantees the workspace has an active mode assignment.
3. `PolicyRepository.listApplicablePolicies(...)` loads policies assigned at:
   - global
   - organization
   - workspace
   - user
4. `PolicyService.collectMatchedRules(...)` filters to:
   - active assignments that apply to the current actor scope
   - active policies
   - enabled rules
   - requested categories
   - matching role scopes
   - matching workspace role scopes
   - matching tool names
   - matching model patterns
   - matching rule conditions such as:
     - content regex/patterns
     - allowed/disallowed URL hosts
     - file extensions
     - max file size
     - metadata equality constraints
5. For each category, matches are sorted by:
   - scope specificity (`user` > `workspace` > `organization` > `global`)
   - decision severity (`deny` > `require_approval` > `warn` > `allow`)
   - combined rule + assignment priority
6. If no rule matches a category, the system falls back to `DEFAULT_CATEGORY_DECISIONS`.
7. `highestDecision(...)` picks the strongest decision across all categories in the request.
8. `policy_audit_logs` records one audit row per matched category/rule unless the call is dry-run.
9. Enforcement behavior:
   - `allow`: request proceeds
   - `warn`: request proceeds and warnings are returned
   - `require_approval`: service throws a `403` with policy details
   - `deny`: service throws a `403` with policy details

Example:

- Chat asks for vulnerability analysis of a public URL.
- Categories become `vulnerability_analysis` and `external_url_access`.
- In `open` mode both may allow.
- In `enterprise` mode, vulnerability analysis may require approval while URL access may warn.
- Final decision becomes `require_approval` because it is the stronger decision.

## Complete Authorized Active Testing Pipeline

This is the full run path implemented by `AuthorizedSecurityTestingService`.

### 1. Verification creation

Entry point:

- `POST /api/v1/admin/authorized-testing/verifications`

Flow:

1. Normalize the requested target into a URL and hostname.
2. Check whether the target is:
   - a standard public hostname
   - a development-local target allowed by dev mode
   - a development-bypass hostname allowed by explicit bypass configuration
3. Policy-check the verification request as security research plus external URL access.
4. Create a challenge token and method-specific instructions for:
   - `dns_txt`
   - `http_file`
   - `html_meta`
5. Persist the verification row in `authorized_domain_verifications`.
6. For development-local or bypass flows, the system can mark the verification as immediately verified and store evidence describing why.

### 2. Verification check

Entry point:

- `POST /api/v1/admin/authorized-testing/verifications/:verificationId/check`

Flow:

1. Load the verification scoped to the actor workspace.
2. Rebuild the expected challenge from stored method + token.
3. If it is a development-local or development-bypass verification, revalidate the mode and refresh expiry/evidence.
4. Otherwise check the public hostname by the selected method:
   - TXT record lookup
   - HTTP challenge file fetch
   - HTML meta tag fetch
5. Update the verification to `verified`, `failed`, or `expired`.

### 3. Run creation

Entry point:

- `POST /api/v1/admin/authorized-testing/runs`

Flow:

1. Normalize URL, modules, max pages, max requests, and auth profiles.
2. Load an existing verification or create an implicit development verification when allowed.
3. Ensure:
   - hostname matches the verified hostname exactly
   - verification is verified
   - verification is not expired
4. Policy-check the active test request as:
   - `security_research`
   - `vulnerability_analysis`
   - `external_url_access`
5. Re-run safe public URL validation.
6. Build run guardrails such as:
   - read-only methods only
   - same-origin only
   - request budget
   - development-mode qualifiers where relevant
7. Create an `authorized_security_test_runs` row with status `planned`.
8. Initialize in-memory run state:
   - request counters
   - probe cache
   - pending probe cache
   - adaptive backoff counters
   - module concurrency

Private Mode precondition:

- `AdminService.assertPrivateModeActiveForSecurityWork(...)` runs before this entry point is allowed to proceed.
- If there is no active cloaked session for the workspace, the request is rejected with `403` and a `privateModePath` hint pointing to `/admin/private-mode`.

### 4. Audit trail bootstrap

The service writes early events into `authorized_security_test_events`:

- run created
- ownership context
- each guardrail message

### 5. Passive baseline scan

Before any active probing, the service runs:

- `WebsiteScannerService.scanWebsite(...)`

Output becomes:

- baseline metadata
- passive warnings
- discovered pages and exposed endpoints

This passive baseline is persisted into the run and reused for module planning.

### 6. Module prioritization and planning

1. The service computes module priorities from passive scan evidence and provided auth profiles.
2. It builds a plan either:
   - with AI structured output
   - or deterministic fallback logic
3. Plan steps are normalized into `AuthorizedSecurityPlanStep[]`.
4. Module concurrency is set relative to request budget and number of steps.
5. The run moves to `running` and stores:
   - baseline
   - plan
   - `started_at`
6. A `plan` event records planning source, step count, concurrency, and module priorities.

### 7. Module execution

Modules are executed by `executePlannedModules(...)`, which fans work out to a bounded worker pool.

Supported modules:

- `sql_injection`
- `xss`
- `authentication`
- `authorization`
- `api_security`
- `waf`
- `session_management`

Each module:

1. Logs a `status` event announcing execution.
2. Uses only safe, read-only requests (`GET`, `HEAD`, `OPTIONS`).
3. Reuses passive discovery to choose candidate URLs.
4. Uses `performProbe(...)` and `executeNetworkProbe(...)` with:
   - request budget accounting
   - in-memory deduplicating probe cache
   - pending-probe coalescing
   - retry-after backoff handling
5. Emits:
   - findings
   - warnings
   - request events

### 8. Adaptive follow-up

After the initial modules:

1. The service evaluates findings and run state to decide whether deeper bounded follow-up is justified.
2. It can use AI or heuristics to build `AuthorizedSecurityAdaptationDecision[]`.
3. Additional plan steps are appended.
4. Additional modules are executed under the same guardrails and request budget.

### 9. Findings validation, prediction, and attack-path modeling

Once module execution finishes:

1. Findings are validated by AI or heuristics with dispositions such as:
   - `confirmed`
   - `needs_review`
   - `unlikely`
2. The service builds predictions for likely-but-not-yet-confirmed issues.
3. Attack paths are modeled:
   - AI-first through structured output
   - deterministic fallback if AI is unavailable

### 10. Summary and AI analysis

The run summary is assembled with:

- risk level
- request budget and requests sent
- executed modules
- module priorities
- execution insights
- adaptation decisions
- finding counts
- recommended actions
- campaign story narrative

Then `buildAiAnalysis(...)` optionally produces:

- headline
- executive summary
- next steps
- predictions

If AI analysis fails, the run still completes with a deterministic summary and an `unavailable` AI status.

### 11. Persistence and retrieval

On success:

1. `authorized_security_test_runs` is updated to `completed`.
2. Final baseline, plan, summary, findings, attack paths, AI analysis, warnings, and `completed_at` are stored.
3. A final `summary` event is recorded.
4. The report is reconstructed with verification and timeline events when read back through:
   - `GET /api/v1/admin/authorized-testing/runs`
   - `GET /api/v1/admin/authorized-testing/runs/:runId`

On failure:

1. The run is marked `failed`.
2. Warnings include the failure reason.
3. A high-severity `warning` event records the failure.

## Contributor Starting Points

For a new developer, these are the fastest orientation entry points:

1. `backend/src/bootstrap/create-app-context.ts`
   - shows the full dependency graph and service wiring.
2. `backend/src/api/routes/index.ts`
   - shows the HTTP surface area and route grouping.
3. `backend/src/services/chat/chat.service.ts`
   - best single file for understanding the normal assistant request path.
4. `backend/src/services/policy/policy.service.ts`
   - best file for understanding governance and audit.
5. `backend/src/services/authorized-testing/authorized-security-testing.service.ts`
   - best file for understanding the most complex security workflow.
6. `frontend/components/app/assistant-workspace.tsx`
   - shows how the main UI bootstraps and coordinates chat, tools, memory, and tasks.
7. `frontend/lib/api.ts`
   - shows how the frontend authenticates, refreshes sessions, and maps backend endpoints.
8. `backend/src/services/private-mode/cloaking.service.ts`
   - shows how cloaked fetch, circuit rotation, exit verification, and cloaked DNS resolution are implemented.
9. `frontend/components/admin/private-mode-console.tsx`
   - shows the staged activation UX and the admin-side gate that prepares security tools for use.

## Current Architectural Limits

These are important to know before extending the system:

- Redis is not yet used as a distributed queue; agent execution and network event fan-out are process-local.
- Authorized testing probe caches are in-memory per run, not cross-run or cross-process.
- Only the Tor-backed transport is implemented directly inside the application today. `vpn-chain` and `hybrid` are valid configuration strategies, but non-Tor transport still depends on external network plumbing rather than an in-process WireGuard orchestrator.
- Registration exists as a route but is intentionally disabled by `AuthService.register()`.
- The penetration-testing orchestrator factory is wired into the app context but is not yet exposed via stable routes.
- The stack is PostgreSQL-based today; any MongoDB assumptions are out of date relative to the repository.
