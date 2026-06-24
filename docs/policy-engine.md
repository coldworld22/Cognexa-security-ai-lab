# AI Policy Engine

## Architecture

The Cognexa request path now enforces AI governance through a dedicated policy layer:

`User -> Authentication -> RBAC -> Policy Engine -> Tool Permissions -> Model Router -> LLM Provider`

Implementation mapping:

- `Authentication`: existing JWT/session flow in `backend/src/services/auth`.
- `RBAC`: existing `AuthorizationService` checks route and service permissions before privileged actions.
- `Policy Engine`: new `PolicyService` evaluates scoped AI rules and records every decision.
- `Tool Permissions`: `ToolExecutionService` now evaluates tool-specific policy categories before execution.
- `Model Router`: `LLMService` now evaluates policy context before selecting a provider/model.
- `Audit`: `policy_audit_logs` records the evaluated action, category, scope, tool/model context, and final decision.

## Policy Levels

Policies are assigned through `policy_assignments` and resolved in this order:

1. `global`
2. `organization`
3. `workspace`
4. `user`

Rules inherit from broader scopes and can be overridden by more specific scopes through assignment precedence and rule priority.

## Policy Modes

System policy templates are seeded for:

- `open`
- `strict`
- `enterprise`
- `research`

Workspace mode is stored as an active `mode` assignment. New workspaces are provisioned into `open` mode automatically. `custom` mode references an administrator-managed non-system policy.

## Content Categories

Supported categories:

- `code_generation`
- `security_research`
- `vulnerability_analysis`
- `document_access`
- `external_url_access`
- `agent_execution`
- `tool_usage`
- `file_uploads`
- `database_queries`
- `command_execution`

Supported decisions:

- `allow`
- `warn`
- `require_approval`
- `deny`

## Database Changes

Added migration: `backend/src/database/migrations/0007_ai_policy_engine.sql`

New tables:

- `policies`
- `policy_rules`
- `policy_assignments`
- `policy_audit_logs`

Seeded records:

- global security baseline assignment
- open mode policy template
- strict mode policy template
- enterprise mode policy template
- research mode policy template

## API Changes

New admin endpoints:

- `GET /api/v1/admin/policies`
- `POST /api/v1/admin/policies`
- `PUT /api/v1/admin/policies/:policyId`
- `DELETE /api/v1/admin/policies/:policyId`
- `POST /api/v1/admin/policies/evaluate`
- `GET /api/v1/admin/policies/audit-logs`
- `PUT /api/v1/admin/policies/workspace-mode`

Existing runtime endpoints now enforce policy decisions before execution:

- chat message generation and streaming
- agent execution
- RAG upload and retrieval
- tool execution
- provider/model routing
- admin website security scans

## UI Changes

`frontend/app/admin/page.tsx` now exposes a policy management console that supports:

- policy creation and editing
- rule enable/disable and priority updates
- scope assignment editing
- workspace mode switching
- policy evaluation testing
- audit log review
- a passive website scanner that evaluates public URLs against the current workspace policy posture
- a security review lab that validates live API perimeter checks, workspace-boundary handling, and role/workspace authorization expectations for the current deployment

## Security Notes

The policy engine is configurable and now supports a fully permissive `open` mode, but some lower-level safeguards still remain:

- stricter modes still apply restrictive decisions
- existing RBAC remains in place
- tool-level safety controls remain in place (`web-search` SSRF protection, read-only SQL guardrails)
- model/provider-side safety limits can still apply outside the app policy layer
- the website scanner is passive-only, limited to public HTTP(S) targets, blocks private-network redirects, and evaluates both `external_url_access` and `vulnerability_analysis`
- every policy decision is logged before execution continues

## Rollout Plan

1. Run database migrations.
2. Deploy backend with the new policy service and admin endpoints.
3. Deploy frontend with the admin policy console.
4. Verify seeded workspace mode assignments and audit log flow.
5. Create tenant-specific workspace and user overlays where stricter or more permissive governance is required.
