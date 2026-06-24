CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL CHECK (mode IN ('strict', 'enterprise', 'research', 'custom')),
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_rules (
  id UUID PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (
    category IN (
      'code_generation',
      'security_research',
      'vulnerability_analysis',
      'document_access',
      'external_url_access',
      'agent_execution',
      'tool_usage',
      'file_uploads',
      'database_queries',
      'command_execution'
    )
  ),
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'warn', 'require_approval', 'deny')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  description TEXT,
  tool_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  role_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  workspace_role_scopes JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_assignments (
  id UUID PRIMARY KEY,
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'organization', 'workspace', 'user')),
  scope_id UUID,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('baseline', 'mode', 'overlay')) DEFAULT 'overlay',
  mode TEXT CHECK (mode IN ('strict', 'enterprise', 'research', 'custom')),
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS policy_audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'code_generation',
      'security_research',
      'vulnerability_analysis',
      'document_access',
      'external_url_access',
      'agent_execution',
      'tool_usage',
      'file_uploads',
      'database_queries',
      'command_execution'
    )
  ),
  tool_name TEXT,
  model TEXT,
  provider TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'warn', 'require_approval', 'deny')),
  mode TEXT NOT NULL CHECK (mode IN ('strict', 'enterprise', 'research', 'custom')),
  policy_id UUID REFERENCES policies(id) ON DELETE SET NULL,
  matched_rule_id UUID REFERENCES policy_rules(id) ON DELETE SET NULL,
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'organization', 'workspace', 'user')),
  scope_id UUID,
  request_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS policy_rules_policy_id_idx
  ON policy_rules (policy_id, priority DESC);

CREATE INDEX IF NOT EXISTS policy_assignments_scope_idx
  ON policy_assignments (scope_type, scope_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS policy_assignments_workspace_mode_active_idx
  ON policy_assignments (scope_id)
  WHERE scope_type = 'workspace' AND assignment_type = 'mode' AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS policy_audit_logs_workspace_id_idx
  ON policy_audit_logs (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS policy_audit_logs_user_id_idx
  ON policy_audit_logs (user_id, created_at DESC);

INSERT INTO policies (
  id,
  name,
  description,
  mode,
  is_system,
  is_active,
  metadata,
  created_at,
  updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000701', 'Global AI Security Baseline', 'System baseline that blocks or constrains privileged AI operations across all tenants.', 'enterprise', TRUE, TRUE, '{"seeded": true, "policyClass": "baseline"}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000702', 'Strict Mode', 'High-friction mode for tightly controlled workspaces.', 'strict', TRUE, TRUE, '{"seeded": true, "policyClass": "mode"}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000703', 'Enterprise Mode', 'Balanced enterprise controls for standard engineering workspaces.', 'enterprise', TRUE, TRUE, '{"seeded": true, "policyClass": "mode"}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000704', 'Research Mode', 'Expanded allowances for approved security research workflows.', 'research', TRUE, TRUE, '{"seeded": true, "policyClass": "mode"}'::jsonb, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO policy_rules (
  id,
  policy_id,
  category,
  decision,
  enabled,
  priority,
  description,
  tool_names,
  role_scopes,
  workspace_role_scopes,
  model_patterns,
  conditions,
  created_at,
  updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000711', '00000000-0000-0000-0000-000000000701', 'command_execution', 'deny', TRUE, 1000, 'Command execution stays denied by default.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000712', '00000000-0000-0000-0000-000000000701', 'database_queries', 'deny', TRUE, 900, 'Database query access requires an explicit scoped override.', '["database-query"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000713', '00000000-0000-0000-0000-000000000701', 'agent_execution', 'require_approval', TRUE, 850, 'Agent execution is privileged and should be explicitly approved.', '[]'::jsonb, '[]'::jsonb, '["owner","admin"]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000714', '00000000-0000-0000-0000-000000000701', 'external_url_access', 'warn', TRUE, 700, 'External website access is allowed with audit visibility.', '["web-search"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000721', '00000000-0000-0000-0000-000000000702', 'security_research', 'deny', TRUE, 800, 'Strict mode blocks security research prompts by default.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000722', '00000000-0000-0000-0000-000000000702', 'vulnerability_analysis', 'deny', TRUE, 800, 'Strict mode blocks vulnerability analysis requests.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000723', '00000000-0000-0000-0000-000000000702', 'external_url_access', 'deny', TRUE, 800, 'Strict mode blocks external URL access.', '["web-search"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000724', '00000000-0000-0000-0000-000000000702', 'agent_execution', 'deny', TRUE, 900, 'Strict mode disables agent execution.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000731', '00000000-0000-0000-0000-000000000703', 'code_generation', 'allow', TRUE, 500, 'Enterprise mode allows standard coding assistance.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '["*"]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000732', '00000000-0000-0000-0000-000000000703', 'security_research', 'warn', TRUE, 650, 'Enterprise mode allows security research with warning and audit.', '[]'::jsonb, '["super_admin","admin","manager","developer"]'::jsonb, '["owner","admin","member"]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000733', '00000000-0000-0000-0000-000000000703', 'vulnerability_analysis', 'require_approval', TRUE, 700, 'Enterprise mode requires approval for vulnerability analysis.', '[]'::jsonb, '[]'::jsonb, '["owner","admin"]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000734', '00000000-0000-0000-0000-000000000703', 'document_access', 'allow', TRUE, 500, 'Enterprise mode allows document retrieval.', '["file-search","repository-search","documentation-search"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000735', '00000000-0000-0000-0000-000000000703', 'agent_execution', 'allow', TRUE, 760, 'Enterprise mode allows agent execution for workspace admins and members.', '[]'::jsonb, '[]'::jsonb, '["owner","admin","member"]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000741', '00000000-0000-0000-0000-000000000704', 'security_research', 'allow', TRUE, 800, 'Research mode enables security research workflows.', '[]'::jsonb, '["super_admin","admin","manager","developer"]'::jsonb, '["owner","admin","member"]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000742', '00000000-0000-0000-0000-000000000704', 'vulnerability_analysis', 'allow', TRUE, 800, 'Research mode enables vulnerability analysis.', '[]'::jsonb, '["super_admin","admin","manager","developer"]'::jsonb, '["owner","admin","member"]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000743', '00000000-0000-0000-0000-000000000704', 'external_url_access', 'allow', TRUE, 750, 'Research mode allows external URL access.', '["web-search"]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000744', '00000000-0000-0000-0000-000000000704', 'database_queries', 'require_approval', TRUE, 840, 'Research mode still requires approval for database queries.', '["database-query"]'::jsonb, '[]'::jsonb, '["owner","admin"]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO policy_assignments (
  id,
  policy_id,
  scope_type,
  scope_id,
  assignment_type,
  mode,
  priority,
  is_active,
  created_at,
  updated_at
)
VALUES
  ('00000000-0000-0000-0000-000000000751', '00000000-0000-0000-0000-000000000701', 'global', NULL, 'baseline', 'enterprise', 1000, TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO policy_assignments (
  id,
  policy_id,
  scope_type,
  scope_id,
  assignment_type,
  mode,
  priority,
  is_active,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000703',
  'workspace',
  w.id,
  'mode',
  'enterprise',
  100,
  TRUE,
  NOW(),
  NOW()
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1
  FROM policy_assignments pa
  WHERE pa.scope_type = 'workspace'
    AND pa.scope_id = w.id
    AND pa.assignment_type = 'mode'
    AND pa.is_active = TRUE
);
