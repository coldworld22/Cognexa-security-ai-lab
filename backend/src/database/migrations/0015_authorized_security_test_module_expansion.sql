DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'authorized_security_test_events_category_check'
  ) THEN
    ALTER TABLE authorized_security_test_events
      DROP CONSTRAINT authorized_security_test_events_category_check;
  END IF;
END $$;

ALTER TABLE authorized_security_test_events
  ADD CONSTRAINT authorized_security_test_events_category_check
  CHECK (
    category IS NULL OR category IN (
      'sql_injection',
      'xss',
      'csrf',
      'authentication',
      'authorization',
      'api_security',
      'ssrf',
      'open_redirect',
      'business_logic',
      'oauth_flow',
      'waf',
      'session_management'
    )
  );
