-- Privacy-preserving, scoped learning telemetry for the central Frieren Neural service.
-- Stores no prompts, replies, Discord IDs, or message content.
CREATE TABLE IF NOT EXISTS neural_learning_signals (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_scope_hash CHAR(64) NOT NULL CHECK (length(guild_scope_hash) = 64),
    user_scope_hash CHAR(64) NOT NULL CHECK (length(user_scope_hash) = 64),
    signal_type TEXT NOT NULL CHECK (signal_type IN ('correction', 'uncertainty', 'repeated_question')),
    dimension TEXT NOT NULL CHECK (dimension IN ('correctness', 'grounding', 'conversation_consistency')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
      (signal_type = 'correction' AND dimension = 'correctness') OR
      (signal_type = 'uncertainty' AND dimension = 'grounding') OR
      (signal_type = 'repeated_question' AND dimension = 'conversation_consistency')
    )
);
CREATE INDEX IF NOT EXISTS neural_learning_signals_recent_idx ON neural_learning_signals (created_at DESC);
CREATE INDEX IF NOT EXISTS neural_learning_signals_scope_idx
    ON neural_learning_signals (guild_scope_hash, user_scope_hash, signal_type, created_at DESC);
