DO $$
BEGIN
  IF to_regclass('public.embeddings') IS NOT NULL THEN
    EXECUTE $sql$
      ALTER TABLE embeddings
        ALTER COLUMN vector TYPE VECTOR
        USING vector::vector
    $sql$;

    EXECUTE 'CREATE INDEX IF NOT EXISTS embeddings_file_id_idx ON embeddings (file_id)';
  END IF;
END
$$;
