CREATE TABLE IF NOT EXISTS private_mode_configs (
  workspace_id UUID PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('direct', 'cloaked')),
  outbound_strategy TEXT NOT NULL CHECK (
    outbound_strategy IN ('tor', 'vpn-chain', 'hybrid', 'rotating-proxy')
  ),
  vpn_relays JSONB NOT NULL DEFAULT '[]'::jsonb,
  tor_control_port INTEGER NOT NULL DEFAULT 9051 CHECK (tor_control_port > 0),
  tor_socks_port INTEGER NOT NULL DEFAULT 9050 CHECK (tor_socks_port > 0),
  dns_over_tor BOOLEAN NOT NULL DEFAULT TRUE,
  exit_geography_preference JSONB NOT NULL DEFAULT '[]'::jsonb,
  circuit_rotation_interval INTEGER NOT NULL DEFAULT 600 CHECK (circuit_rotation_interval > 0),
  tls_fingerprint_profile TEXT NOT NULL CHECK (
    tls_fingerprint_profile IN ('browser', 'curl', 'random')
  ),
  request_timing_jitter INTEGER NOT NULL DEFAULT 0 CHECK (request_timing_jitter >= 0),
  enabled_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS private_mode_sessions (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL CHECK (
    strategy IN ('tor', 'vpn-chain', 'hybrid', 'rotating-proxy')
  ),
  exit_nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
  circuit_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS private_mode_sessions_active_workspace_idx
  ON private_mode_sessions (workspace_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS private_mode_sessions_workspace_idx
  ON private_mode_sessions (workspace_id, started_at DESC);

CREATE TABLE IF NOT EXISTS private_mode_exit_logs (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES private_mode_sessions(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  exit_ip TEXT NOT NULL,
  exit_region TEXT NOT NULL,
  target_host TEXT NOT NULL,
  request_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS private_mode_exit_logs_workspace_idx
  ON private_mode_exit_logs (workspace_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS private_mode_exit_logs_session_idx
  ON private_mode_exit_logs (session_id, timestamp DESC);
