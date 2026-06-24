CREATE TABLE IF NOT EXISTS managed_endpoints (
  id UUID PRIMARY KEY,
  agent_id TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  hostname TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  mac_address TEXT,
  subnet TEXT,
  operating_system TEXT NOT NULL,
  logged_in_user TEXT,
  status TEXT NOT NULL CHECK (status IN ('online', 'degraded', 'offline')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  last_seen_at TIMESTAMPTZ NOT NULL,
  telemetry JSONB NOT NULL DEFAULT '{"activeAlerts": 0}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS managed_endpoints_last_seen_idx
  ON managed_endpoints (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS managed_endpoints_ip_address_idx
  ON managed_endpoints (ip_address);

CREATE INDEX IF NOT EXISTS managed_endpoints_mac_address_idx
  ON managed_endpoints (mac_address);
