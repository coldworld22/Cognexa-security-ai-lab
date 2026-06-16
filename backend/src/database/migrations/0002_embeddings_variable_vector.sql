ALTER TABLE embeddings
  ALTER COLUMN vector TYPE VECTOR
  USING vector::vector;

CREATE INDEX IF NOT EXISTS embeddings_file_id_idx
  ON embeddings (file_id);
