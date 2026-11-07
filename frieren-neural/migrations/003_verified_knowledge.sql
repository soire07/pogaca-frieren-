-- Curated, license-checked knowledge. Private chat messages are never ingested here.
CREATE TABLE IF NOT EXISTS neural_knowledge_candidates (
    candidate_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (length(title) BETWEEN 5 AND 160),
    content TEXT NOT NULL CHECK (length(content) BETWEEN 30 AND 2500),
    source_excerpt TEXT NOT NULL CHECK (length(source_excerpt) BETWEEN 40 AND 6000),
    source_title TEXT NOT NULL CHECK (length(source_title) BETWEEN 3 AND 180),
    source_url TEXT NOT NULL CHECK (length(source_url) BETWEEN 9 AND 2048),
    source_revision TEXT,
    license TEXT NOT NULL CHECK (license IN ('APACHE-2.0','MIT','CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0')),
    source_sha256 CHAR(64) NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
    content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    submitted_by_hash CHAR(64) NOT NULL CHECK (submitted_by_hash ~ '^[a-f0-9]{64}$'),
    status TEXT NOT NULL DEFAULT 'pending_review'
        CHECK (status IN ('pending_review','rejected','promoted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS neural_knowledge_candidates_status_idx
    ON neural_knowledge_candidates (status, created_at DESC);

CREATE TABLE IF NOT EXISTS neural_knowledge_reviews (
    candidate_id UUID NOT NULL REFERENCES neural_knowledge_candidates(candidate_id) ON DELETE CASCADE,
    reviewer_identity_hash CHAR(64) NOT NULL CHECK (reviewer_identity_hash ~ '^[a-f0-9]{64}$'),
    decision TEXT NOT NULL CHECK (decision IN ('approve','reject')),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (candidate_id, reviewer_identity_hash)
);
CREATE INDEX IF NOT EXISTS neural_knowledge_reviews_candidate_idx
    ON neural_knowledge_reviews (candidate_id, decision, reviewed_at);

CREATE TABLE IF NOT EXISTS neural_knowledge_entries (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id UUID NOT NULL UNIQUE REFERENCES neural_knowledge_candidates(candidate_id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source_title TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_revision TEXT,
    license TEXT NOT NULL CHECK (license IN ('APACHE-2.0','MIT','CC0-1.0','CC-BY-4.0','CC-BY-SA-4.0')),
    source_sha256 CHAR(64) NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
    content_sha256 CHAR(64) NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    approved_by_hashes CHAR(64)[] NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        cardinality(approved_by_hashes) = 2
        AND approved_by_hashes[1] ~ '^[a-f0-9]{64}$'
        AND approved_by_hashes[2] ~ '^[a-f0-9]{64}$'
        AND approved_by_hashes[1] <> approved_by_hashes[2]
    )
);
CREATE INDEX IF NOT EXISTS neural_knowledge_entries_search_idx
    ON neural_knowledge_entries USING GIN (to_tsvector('simple', title || ' ' || content));
