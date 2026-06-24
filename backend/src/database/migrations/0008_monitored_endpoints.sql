CREATE TABLE IF NOT EXISTS monitored_endpoints (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT NOT NULL,
  hostname TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  subnet TEXT NOT NULL,
  operating_system TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('online', 'degraded', 'offline')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  last_seen_at TIMESTAMPTZ,
  logged_in_user TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  telemetry JSONB NOT NULL DEFAULT '{"activeAlerts": 0}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS monitored_endpoints_workspace_ip_address_idx
  ON monitored_endpoints (workspace_id, ip_address);

CREATE INDEX IF NOT EXISTS monitored_endpoints_workspace_status_idx
  ON monitored_endpoints (workspace_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS monitored_endpoints_workspace_risk_idx
  ON monitored_endpoints (workspace_id, risk_level, updated_at DESC);
