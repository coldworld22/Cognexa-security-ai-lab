CREATE TABLE IF NOT EXISTS authorized_domain_verifications (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  hostname TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('dns_txt', 'http_file', 'html_meta')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'verified', 'failed', 'expired')),
  challenge_token TEXT NOT NULL,
  challenge_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_checked_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS authorized_domain_verifications_workspace_idx
  ON authorized_domain_verifications (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS authorized_domain_verifications_hostname_idx
  ON authorized_domain_verifications (hostname, status, expires_at DESC);

CREATE TABLE IF NOT EXISTS authorized_security_test_runs (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  verification_id UUID NOT NULL REFERENCES authorized_domain_verifications(id) ON DELETE RESTRICT,
  requested_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_url TEXT NOT NULL,
  hostname TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'running', 'completed', 'failed')),
  requested_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  guardrails JSONB NOT NULL DEFAULT '[]'::jsonb,
  redacted_auth_profiles JSONB NOT NULL DEFAULT '[]'::jsonb,
  baseline JSONB NOT NULL DEFAULT '{}'::jsonb,
  plan JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  attack_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
  ai_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS authorized_security_test_runs_workspace_idx
  ON authorized_security_test_runs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS authorized_security_test_runs_verification_idx
  ON authorized_security_test_runs (verification_id, created_at DESC);

CREATE TABLE IF NOT EXISTS authorized_security_test_events (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES authorized_security_test_runs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'status',
      'ownership',
      'guardrail',
      'plan',
      'discovery',
      'request',
      'finding',
      'warning',
      'summary'
    )
  ),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'low', 'medium', 'high')),
  category TEXT CHECK (
    category IS NULL OR category IN (
      'sql_injection',
      'xss',
      'authentication',
      'authorization',
      'api_security',
      'waf',
      'session_management'
    )
  ),
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS authorized_security_test_events_run_idx
  ON authorized_security_test_events (run_id, created_at ASC);
