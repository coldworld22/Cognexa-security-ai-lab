CREATE TABLE IF NOT EXISTS mobile_scan_results (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_name TEXT NOT NULL,
  package_name TEXT NOT NULL,
  version TEXT NOT NULL,
  target_sdk INTEGER NOT NULL DEFAULT 0,
  min_sdk INTEGER NOT NULL DEFAULT 0,
  file_size BIGINT NOT NULL DEFAULT 0,
  security_score INTEGER NOT NULL CHECK (security_score >= 0 AND security_score <= 100),
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  vulnerabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  trackers JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  scan_date TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS mobile_scan_results_workspace_idx
  ON mobile_scan_results (workspace_id, scan_date DESC);
