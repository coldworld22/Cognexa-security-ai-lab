ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE tasks
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;
