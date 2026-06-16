UPDATE users
SET role = 'developer'
WHERE role = 'user';

ALTER TABLE users
  ALTER COLUMN role SET DEFAULT 'developer';

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('super_admin', 'admin', 'manager', 'developer', 'viewer'));

CREATE TABLE IF NOT EXISTS authorization_audit_logs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  user_email TEXT,
  user_role TEXT,
  permission TEXT NOT NULL,
  layer TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS authorization_audit_logs_user_id_created_at_idx
  ON authorization_audit_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS authorization_audit_logs_permission_created_at_idx
  ON authorization_audit_logs (permission, created_at DESC);
