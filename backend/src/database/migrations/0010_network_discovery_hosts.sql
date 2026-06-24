CREATE TABLE IF NOT EXISTS network_discovery_hosts (
  id UUID PRIMARY KEY,
  ip_address TEXT NOT NULL UNIQUE,
  hostname TEXT NOT NULL,
  mac_address TEXT,
  vendor TEXT,
  subnet TEXT NOT NULL,
  interface_address TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('online', 'offline')),
  resolution_source TEXT NOT NULL CHECK (
    resolution_source IN ('dns', 'netbios', 'smb', 'mdns', 'agent', 'unresolved')
  ),
  resolution_cached_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS network_discovery_hosts_status_idx
  ON network_discovery_hosts (status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS network_discovery_hosts_subnet_idx
  ON network_discovery_hosts (subnet, updated_at DESC);

CREATE INDEX IF NOT EXISTS network_discovery_hosts_resolution_idx
  ON network_discovery_hosts (resolution_source, resolution_cached_at DESC);
