CREATE TABLE IF NOT EXISTS owner_guardian_evidence_chain (
  sequence_no BIGSERIAL PRIMARY KEY,
  event_id VARCHAR(128) NOT NULL UNIQUE,
  source VARCHAR(40) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observed_at TIMESTAMPTZ NOT NULL,
  severity VARCHAR(16) NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  client_ip INET,
  ip_source VARCHAR(32) NOT NULL,
  payload JSONB NOT NULL,
  event_hash CHAR(64) NOT NULL UNIQUE,
  previous_hash CHAR(64) NOT NULL
);

CREATE OR REPLACE FUNCTION reject_guardian_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'GUARDIAN_EVIDENCE_CHAIN_APPEND_ONLY';
END;
$$;

DROP TRIGGER IF EXISTS owner_guardian_evidence_no_update ON owner_guardian_evidence_chain;
CREATE TRIGGER owner_guardian_evidence_no_update
BEFORE UPDATE OR DELETE ON owner_guardian_evidence_chain
FOR EACH ROW EXECUTE FUNCTION reject_guardian_evidence_mutation();

DROP TRIGGER IF EXISTS owner_guardian_evidence_no_truncate ON owner_guardian_evidence_chain;
CREATE TRIGGER owner_guardian_evidence_no_truncate
BEFORE TRUNCATE ON owner_guardian_evidence_chain
FOR EACH STATEMENT EXECUTE FUNCTION reject_guardian_evidence_mutation();

REVOKE UPDATE, DELETE, TRUNCATE ON owner_guardian_evidence_chain FROM PUBLIC;
