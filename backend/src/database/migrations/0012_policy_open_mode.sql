ALTER TABLE policies
  DROP CONSTRAINT IF EXISTS policies_mode_check;

ALTER TABLE policies
  ADD CONSTRAINT policies_mode_check
  CHECK (mode IN ('open', 'strict', 'enterprise', 'research', 'custom'));

ALTER TABLE policy_assignments
  DROP CONSTRAINT IF EXISTS policy_assignments_mode_check;

ALTER TABLE policy_assignments
  ADD CONSTRAINT policy_assignments_mode_check
  CHECK (mode IN ('open', 'strict', 'enterprise', 'research', 'custom'));

ALTER TABLE policy_audit_logs
  DROP CONSTRAINT IF EXISTS policy_audit_logs_mode_check;

ALTER TABLE policy_audit_logs
  ADD CONSTRAINT policy_audit_logs_mode_check
  CHECK (mode IN ('open', 'strict', 'enterprise', 'research', 'custom'));

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
VALUES (
  '00000000-0000-0000-0000-000000000705',
  'Open Mode',
  'Fully permissive workspace mode that leaves request governance to workspace administrators and lower-level tool/provider safeguards.',
  'open',
  TRUE,
  TRUE,
  '{"seeded": true, "policyClass": "mode"}'::jsonb,
  NOW(),
  NOW()
)
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
  ('00000000-0000-0000-0000-000000000761', '00000000-0000-0000-0000-000000000705', 'code_generation', 'allow', TRUE, 950, 'Open mode allows code generation.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '["*"]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000762', '00000000-0000-0000-0000-000000000705', 'security_research', 'allow', TRUE, 950, 'Open mode allows security research prompts.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000763', '00000000-0000-0000-0000-000000000705', 'vulnerability_analysis', 'allow', TRUE, 950, 'Open mode allows vulnerability analysis.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000764', '00000000-0000-0000-0000-000000000705', 'document_access', 'allow', TRUE, 950, 'Open mode allows document access.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000765', '00000000-0000-0000-0000-000000000705', 'external_url_access', 'allow', TRUE, 950, 'Open mode allows external URL access.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000766', '00000000-0000-0000-0000-000000000705', 'agent_execution', 'allow', TRUE, 950, 'Open mode allows agent execution.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000767', '00000000-0000-0000-0000-000000000705', 'tool_usage', 'allow', TRUE, 950, 'Open mode allows tool usage.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000768', '00000000-0000-0000-0000-000000000705', 'file_uploads', 'allow', TRUE, 950, 'Open mode allows file uploads.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000769', '00000000-0000-0000-0000-000000000705', 'database_queries', 'allow', TRUE, 950, 'Open mode allows database queries.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW()),
  ('00000000-0000-0000-0000-000000000770', '00000000-0000-0000-0000-000000000705', 'command_execution', 'allow', TRUE, 950, 'Open mode allows command execution.', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '{}'::jsonb, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

UPDATE policy_assignments
SET
  policy_id = '00000000-0000-0000-0000-000000000705',
  mode = 'open',
  updated_at = NOW()
WHERE assignment_type = 'mode'
  AND is_active = TRUE
  AND mode = 'enterprise'
  AND policy_id IN (
    '00000000-0000-0000-0000-000000000701',
    '00000000-0000-0000-0000-000000000703'
  );
