CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  billing_email TEXT,
  billing_customer_id TEXT,
  subscription_plan TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT NOT NULL DEFAULT 'trialing',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS workspace_roles (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO workspace_roles (code, name, description, permissions)
VALUES
  ('owner', 'Owner', 'Full tenant administration within the workspace.', '["workspace.manage","workspace.members.manage","workspace.resources.manage"]'::jsonb),
  ('admin', 'Admin', 'Can administer members and manage shared workspace resources.', '["workspace.members.manage","workspace.resources.manage"]'::jsonb),
  ('member', 'Member', 'Can participate in workspace conversations, retrieval, and agents.', '["workspace.resources.use"]'::jsonb),
  ('viewer', 'Viewer', 'Read-oriented access to workspace resources.', '["workspace.resources.read"]'::jsonb)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    permissions = EXCLUDED.permissions,
    updated_at = NOW();

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  is_personal BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL REFERENCES workspace_roles(code),
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  joined_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL REFERENCES workspace_roles(code),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  accepted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS current_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE files
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE embeddings
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE memories
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE tool_executions
  ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

INSERT INTO organizations (
  id,
  name,
  slug,
  billing_email,
  subscription_plan,
  subscription_status,
  metadata,
  created_by_user_id,
  created_at,
  updated_at
)
SELECT
  u.id,
  CONCAT(u.display_name, ' Personal Organization'),
  CONCAT('personal-org-', SUBSTRING(REPLACE(u.id::text, '-', '') FROM 1 FOR 12)),
  u.email,
  'free',
  'trialing',
  jsonb_build_object('personal', true),
  u.id,
  NOW(),
  NOW()
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM organizations o
  WHERE o.id = u.id
);

INSERT INTO workspaces (
  id,
  organization_id,
  name,
  slug,
  is_personal,
  metadata,
  created_by_user_id,
  created_at,
  updated_at
)
SELECT
  u.id,
  u.id,
  CONCAT(u.display_name, ' Workspace'),
  CONCAT('personal-ws-', SUBSTRING(REPLACE(u.id::text, '-', '') FROM 1 FOR 12)),
  TRUE,
  jsonb_build_object('personal', true),
  u.id,
  NOW(),
  NOW()
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM workspaces w
  WHERE w.id = u.id
);

INSERT INTO workspace_members (
  id,
  workspace_id,
  user_id,
  role,
  invited_by_user_id,
  joined_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  u.id,
  u.id,
  'owner',
  u.id,
  NOW(),
  NOW(),
  NOW()
FROM users u
WHERE NOT EXISTS (
  SELECT 1
  FROM workspace_members wm
  WHERE wm.workspace_id = u.id AND wm.user_id = u.id
);

UPDATE users u
SET current_workspace_id = selected.workspace_id,
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (wm.user_id)
    wm.user_id,
    wm.workspace_id
  FROM workspace_members wm
  ORDER BY wm.user_id, wm.joined_at ASC
) selected
WHERE u.id = selected.user_id
  AND u.current_workspace_id IS NULL;

UPDATE conversations c
SET workspace_id = u.current_workspace_id
FROM users u
WHERE c.user_id = u.id
  AND c.workspace_id IS NULL;

UPDATE messages m
SET workspace_id = c.workspace_id
FROM conversations c
WHERE m.conversation_id = c.id
  AND m.workspace_id IS NULL;

UPDATE files f
SET workspace_id = u.current_workspace_id
FROM users u
WHERE f.user_id = u.id
  AND f.workspace_id IS NULL;

UPDATE embeddings e
SET workspace_id = f.workspace_id
FROM files f
WHERE e.file_id = f.id
  AND e.workspace_id IS NULL;

UPDATE memories m
SET workspace_id = u.current_workspace_id
FROM users u
WHERE m.user_id = u.id
  AND m.workspace_id IS NULL;

UPDATE agents a
SET workspace_id = u.current_workspace_id
FROM users u
WHERE a.user_id = u.id
  AND a.workspace_id IS NULL;

UPDATE tasks t
SET workspace_id = a.workspace_id
FROM agents a
WHERE t.agent_id = a.id
  AND t.workspace_id IS NULL;

UPDATE tool_executions te
SET workspace_id = t.workspace_id
FROM tasks t
WHERE te.task_id = t.id
  AND te.workspace_id IS NULL;

ALTER TABLE conversations
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE messages
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE files
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE embeddings
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE memories
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE agents
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE tasks
  ALTER COLUMN workspace_id SET NOT NULL;

ALTER TABLE memories
  DROP CONSTRAINT IF EXISTS memories_user_id_memory_type_key_key;

ALTER TABLE memories
  ADD CONSTRAINT memories_workspace_id_user_id_memory_type_key_key
  UNIQUE (workspace_id, user_id, memory_type, key);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_invitations_workspace_id_email_pending_idx
  ON workspace_invitations (workspace_id, LOWER(email))
  WHERE accepted_at IS NULL;

CREATE INDEX IF NOT EXISTS workspace_members_user_id_idx
  ON workspace_members (user_id);

CREATE INDEX IF NOT EXISTS workspace_members_workspace_id_idx
  ON workspace_members (workspace_id);

CREATE INDEX IF NOT EXISTS workspace_invitations_email_idx
  ON workspace_invitations (LOWER(email));

CREATE INDEX IF NOT EXISTS users_current_workspace_id_idx
  ON users (current_workspace_id);

CREATE INDEX IF NOT EXISTS conversations_workspace_id_idx
  ON conversations (workspace_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS messages_workspace_id_idx
  ON messages (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS files_workspace_id_idx
  ON files (workspace_id);

CREATE INDEX IF NOT EXISTS embeddings_workspace_id_idx
  ON embeddings (workspace_id);

CREATE INDEX IF NOT EXISTS memories_workspace_id_idx
  ON memories (workspace_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agents_workspace_id_idx
  ON agents (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tasks_workspace_id_idx
  ON tasks (workspace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tool_executions_workspace_id_idx
  ON tool_executions (workspace_id, created_at DESC);
