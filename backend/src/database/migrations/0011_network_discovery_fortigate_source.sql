ALTER TABLE network_discovery_hosts
  DROP CONSTRAINT IF EXISTS network_discovery_hosts_resolution_source_check;

ALTER TABLE network_discovery_hosts
  ADD CONSTRAINT network_discovery_hosts_resolution_source_check
  CHECK (
    resolution_source IN (
      'dns',
      'netbios',
      'smb',
      'mdns',
      'fortigate',
      'agent',
      'unresolved'
    )
  );
