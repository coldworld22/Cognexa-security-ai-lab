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
- Admin review tools for LAN monitoring, passive website scanning, inline AI-assisted security review, authorized active testing against verified public domains, and safe perimeter/authorization validation of the current deployment

## What This Product Does

Cognexa Security AI Lab is a self-hosted AI workspace for engineering and security teams. It combines a general-purpose AI assistant with operational security tooling so teams can chat with local models, ground responses on internal documents, run tool-assisted tasks, and review public-facing systems from a defensive perspective.

For users, the product provides one place to:

- Chat with local or OpenAI-compatible models
- Search and reason over uploaded documents through RAG
- Store useful preferences and working context in memory
- Run guided agent tasks with tool execution
- Review public websites with a passive white-hat security workflow
- Run authorized, read-only active security tests against verified public applications
- Monitor local network visibility and admin health surfaces

For developers and operators, the product provides:

- A Next.js frontend for the workspace and admin tools
- A TypeScript and Express backend with modular services
- PostgreSQL and `pgvector` for application data and retrieval
- Redis for runtime state, caching, tokens, and coordination
- Provider abstractions for multiple local model families
- Policy, authorization, and safety boundaries around sensitive actions

## Core Modules

### Chat Workspace

The chat workspace is the main assistant surface. It supports provider and model selection, persisted conversations, message history, document-grounded answers, and tool-assisted responses.

### Retrieval-Augmented Generation (RAG)

The RAG pipeline ingests `.txt`, `.pdf`, and `.docx` files, chunks them, stores embeddings, and retrieves relevant context for model responses. PostgreSQL `pgvector` is the default vector store, with optional Qdrant support.

### Memory

The memory layer stores user preferences, long-term notes, and recent working context so the assistant can behave more consistently across sessions.

### Agents

The agent system runs structured tasks with explicit steps and tool usage. It is designed for controlled, auditable execution rather than free-form autonomous behavior.

### Policy and Authorization

The platform enforces role-based permissions and policy evaluation around sensitive operations such as tool use, external URL access, model calls, and security-related analysis.

### Website Scanner

The website scanner reviews public HTTP and HTTPS websites using passive checks only. It analyzes redirects, TLS trust, HSTS, CSP, headers, cookies, forms, CORS, mixed content, script exposure, exposed API descriptions, sensitive API responses, database or admin interfaces, leaked config files, and limited same-origin crawl behavior.

### Security Review Lab

The Security Review Lab builds on the website scanner and converts passive evidence into an attacker-perspective defensive report. It shows findings, modeled attack paths, remediation priorities, safe retest guidance, and an inline AI analyst summary across browser hardening, cross-origin trust, exposed APIs, leaked internal services, and public data exposure.

Important boundary:

- It is passive and defensive
- It does not exploit targets, inject payloads, brute-force credentials, or attack private/internal hosts
- It is intended to help users understand security weaknesses and fix them

### Authorized Security Testing Lab

The Authorized Security Testing Lab extends the passive workflow into controlled active validation for applications you own and verify first. It is designed for read-only security testing, attack-path modeling, and remediation reporting without destructive actions.

Important boundary:

- Domain ownership must be verified before active testing starts
- Optional localhost/private-network development mode must be explicitly enabled in backend config, only activates under `NODE_ENV=development`, and still records the override in the audit trail
- Testing is limited to verified public hostnames and the original origin
- Requests are limited to safe, reversible `GET`, `HEAD`, and `OPTIONS` methods
- The module does not brute-force accounts, upload files, alter data, or persist payloads
- Vulnerability chaining is modeled from confirmed findings rather than executed destructively
- Every verification, probe, finding, and summary is recorded for audit review

### Network Monitor

The admin network monitor helps discover and review visible LAN assets, track endpoint state, and inspect high-level operational signals for managed and discovered systems.

### Policy Console

The policy console allows administrators to inspect policy rules, test decisions, review audit logs, and manage workspace-level security posture.

## Security Review Lab Details

The Security Review Lab is one of the main security-focused modules in the product. A user provides a public website URL and the module:

1. Fetches and inspects the public entry point
2. Optionally performs a rendered browser crawl for JavaScript-dependent pages
3. Collects passive browser and transport signals
4. Passively probes bounded same-origin API, admin, database, and management endpoints for public exposure
5. Converts those signals into findings and attack-path models
6. Uses an inline AI analyst to summarize what matters most
7. Returns concrete remediation and safe verification guidance

The lab uses these internal components:

- `WebsiteScannerService` for passive crawling and transport or browser checks
- `HeadlessBrowserCrawler` for rendered same-origin page capture
- `SecurityReviewService` for attacker-perspective analysis and prioritization
- `LLMService` for inline AI analyst commentary when a model is available
- `AuthorizationService` and `PolicyService` for permission and safety enforcement

## Authorized Security Testing Lab Details

The Authorized Security Testing Lab is the active counterpart to the passive scanner and security review. A user first proves ownership of a public hostname and then the module:

1. Creates a DNS TXT, HTTP file, or HTML meta verification challenge
2. Confirms the challenge on the public hostname before any active probes run
3. Builds a safe testing plan with AI when a model is available, with deterministic fallback
4. Reuses the passive website scanner as the baseline discovery step
5. Runs read-only probes for SQL injection indicators, inert XSS reflection, authentication gaps, authorization differentials, API exposure, CORS posture, WAF normalization consistency, and session management weaknesses
6. Adapts mid-run by scheduling bounded follow-up modules when early findings justify deeper read-only coverage
7. Converts confirmed findings into modeled attack paths, campaign-style execution storylines, and remediation priorities
8. Persists the run timeline, guardrails, findings, adaptive decisions, and summary for audit review

The lab uses these internal components:

- `AuthorizedSecurityTestingService` for ownership verification, safe active probes, and reporting
- `AuthorizedDomainVerificationRepository` for challenge lifecycle tracking
- `AuthorizedSecurityTestRunRepository` for persisted run reports
- `AuthorizedSecurityTestEventRepository` for probe-by-probe audit history
- `WebsiteScannerService` for passive baseline discovery before active checks
- `LLMService` for planning and remediation summaries when a local model is available
- `AuthorizationService` and `PolicyService` for permission and safety enforcement

## Technology and Tools Used

### Frontend

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- `lucide-react` for iconography
- `react-markdown` and `remark-gfm` for markdown rendering

### Backend

- Node.js
- Express 5
- TypeScript
- Zod for validation and structured parsing
- Pino and `pino-http` for logging
- Helmet, CORS, compression, and cookie parsing middleware
- JWT authentication with access and refresh tokens

### AI and Model Runtime

- Ollama by default through an OpenAI-compatible API surface
- Provider abstractions for:
  - Qwen
  - Llama
  - Mistral
  - Gemma

### Retrieval and Storage

- PostgreSQL for core relational data
- `pgvector` for default embedding storage
- Optional Qdrant vector storage
- Redis for runtime coordination and caching

### Document and Security Tooling

- `pdf-parse` for PDF extraction
- `mammoth` for `.docx` extraction
- `playwright-core` for rendered browser analysis in the website scanner
- DNS and hostname validation for safe public-target checks and domain-ownership verification

## Who This Is For

- Engineering teams that want a private AI workspace
- Security teams that want passive public-surface review tools
- Operators who need local-first deployment with controllable infrastructure
- Developers who want a TypeScript codebase with clear service boundaries

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
- `AUTHORIZED_TESTING_DEV_MODE` for localhost and private-network development targets
- `ENABLE_VERIFICATION_BYPASS` and `VERIFICATION_BYPASS_ALLOWED_DOMAINS` for explicit development-only verification bypass of allowlisted hostnames
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
