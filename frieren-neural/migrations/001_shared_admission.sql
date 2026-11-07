-- Frieren Neural shared admission and login-rate-limit schema.
-- Additive and isolated to the dedicated frieren-neural-infra database.
CREATE TABLE IF NOT EXISTS neural_login_attempts (
    attempt_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_key TEXT NOT NULL CHECK (length(client_key) = 64),
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS neural_login_attempts_client_time_idx
    ON neural_login_attempts (client_key, attempted_at DESC);
CREATE INDEX IF NOT EXISTS neural_login_attempts_time_idx
    ON neural_login_attempts (attempted_at);
