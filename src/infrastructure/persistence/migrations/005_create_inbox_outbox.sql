-- 004_create_inbox_messages.sql
CREATE TABLE inbox_messages (
    message_id    VARCHAR(255) NOT NULL,
    consumer_name VARCHAR(255) NOT NULL,
    payload_hash  VARCHAR(64) NOT NULL,
    received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at  TIMESTAMPTZ,
    PRIMARY KEY (message_id, consumer_name)
);

-- 005_create_outbox_messages.sql
CREATE TABLE outbox_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id    UUID NOT NULL,
    event_type      VARCHAR(100) NOT NULL,
    payload         JSONB NOT NULL,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    published_at    TIMESTAMPTZ,
    CONSTRAINT chk_outbox_pending CHECK (
        (published_at IS NULL AND attempts < 5) OR
        (published_at IS NOT NULL)
    )
);

CREATE INDEX idx_outbox_pending ON outbox_messages(next_attempt_at) WHERE published_at IS NULL;
