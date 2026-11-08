-- 001_create_wallets.sql
CREATE TABLE wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID NOT NULL,
    currency        CHAR(3) NOT NULL,
    balance_amount  NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (balance_amount >= 0),
    version         INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_wallet_player_currency UNIQUE (player_id, currency)
);

CREATE INDEX idx_wallets_player_id ON wallets(player_id);

-- 002_create_wager_transactions.sql
CREATE TABLE wager_transactions (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id                     VARCHAR(255) NOT NULL,
    external_transaction_id         VARCHAR(255) NOT NULL,
    idempotency_key                 VARCHAR(512) NOT NULL,
    payload_hash                    VARCHAR(64) NOT NULL,
    wallet_id                       UUID NOT NULL REFERENCES wallets(id),
    player_id                       UUID NOT NULL,
    round_id                        VARCHAR(255) NOT NULL,
    game_id                         VARCHAR(255) NOT NULL,
    kind                            VARCHAR(20) NOT NULL,
    money_amount                    NUMERIC(20,2) NOT NULL,
    money_currency                  CHAR(3) NOT NULL,
    reference_external_transaction_id VARCHAR(255),
    status                          VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reference_transaction_id        UUID REFERENCES wager_transactions(id),
    failure_code                    VARCHAR(50),
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at                    TIMESTAMPTZ,
    CONSTRAINT uq_idempotency_key UNIQUE (idempotency_key),
    CONSTRAINT uq_provider_external_tx UNIQUE (provider_id, external_transaction_id)
);

CREATE INDEX idx_wager_tx_wallet_id ON wager_transactions(wallet_id);
CREATE INDEX idx_wager_tx_player_id ON wager_transactions(player_id);
CREATE INDEX idx_wager_tx_provider_ext ON wager_transactions(provider_id, external_transaction_id);
CREATE INDEX idx_wager_tx_status ON wager_transactions(status);

-- 003_create_wallet_ledger_entries.sql
CREATE TABLE wallet_ledger_entries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets(id),
    transaction_id  UUID NOT NULL REFERENCES wager_transactions(id),
    direction       VARCHAR(6) NOT NULL CHECK (direction IN ('DEBIT', 'CREDIT')),
    amount          NUMERIC(20,2) NOT NULL CHECK (amount >= 0),
    currency        CHAR(3) NOT NULL,
    balance_before  NUMERIC(20,2) NOT NULL CHECK (balance_before >= 0),
    balance_after   NUMERIC(20,2) NOT NULL CHECK (balance_after >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ledger_transaction UNIQUE (transaction_id)
);

CREATE INDEX idx_ledger_wallet_id ON wallet_ledger_entries(wallet_id);
CREATE INDEX idx_ledger_transaction_id ON wallet_ledger_entries(transaction_id);
