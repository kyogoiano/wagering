# PLAN-000: Core Wagering Domain

## Visão Geral

Plano de implementação do domínio central: Money, Wallet, WagerTransaction, WalletLedgerEntry e FailureCode.

## Módulos NestJS

```
src/
└── domain/
    ├── money/
    │   ├── money.value.ts
    │   └── money.value.spec.ts
    ├── wallet/
    │   ├── wallet.aggregate.ts
    │   ├── wallet.repository.ts
    │   ├── wallet.entity.ts
    │   └── wallet.aggregate.spec.ts
    ├── transaction/
    │   ├── wager-transaction.entity.ts
    │   ├── wager-transaction.aggregate.ts
    │   ├── wager-transaction.repository.ts
    │   ├── wager-transaction-kinds.enum.ts
    │   ├── wager-transaction-status.enum.ts
    │   └── wager-transaction.aggregate.spec.ts
    ├── ledger/
    │   ├── wallet-ledger-entry.entity.ts
    │   ├── wallet-ledger-entry.aggregate.ts
    │   ├── wallet-ledger-entry.repository.ts
    │   ├── ledger-direction.enum.ts
    │   └── wallet-ledger-entry.aggregate.spec.ts
    ├── failure/
    │   └── failure-code.ts
    └── errors/
        ├── insufficient-balance.error.ts
        ├── invalid-currency.error.ts
        ├── invalid-amount.error.ts
        ├── invalid-transaction-state.error.ts
        └── reference-not-found.error.ts
```

## Entities MikroORM

### Wallet Entity

```typescript
@Entity()
export class WalletEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string;

  @Property({ type: 'uuid' })
  playerId: string;

  @Property({ type: 'string', length: 3 })
  currency: string;

  @Property({ type: 'decimal', precision: 20, scale: 2 })
  balanceAmount: string;

  @Property({ type: 'int' })
  version: number;

  @Property({ type: 'datetime' })
  createdAt: Date;

  @Property({ type: 'datetime' })
  updatedAt: Date;

  // Unique constraint: playerId + currency
  // Check constraint: balanceAmount >= 0
}
```

### WagerTransaction Entity

```typescript
@Entity()
export class WagerTransactionEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string;

  @Property({ type: 'string', length: 255 })
  providerId: string;

  @Property({ type: 'string', length: 255 })
  externalTransactionId: string;

  @Property({ type: 'string', length: 512 })
  idempotencyKey: string;

  @Property({ type: 'string', length: 64 })
  payloadHash: string;

  @Property({ type: 'uuid' })
  walletId: string;

  @Property({ type: 'uuid' })
  playerId: string;

  @Property({ type: 'string', length: 255 })
  roundId: string;

  @Property({ type: 'string', length: 255 })
  gameId: string;

  @Property({ type: 'string', length: 20 })
  kind: string;

  @Property({ type: 'decimal', precision: 20, scale: 2 })
  moneyAmount: string;

  @Property({ type: 'string', length: 3 })
  moneyCurrency: string;

  @Property({ type: 'string', length: 255, nullable: true })
  referenceExternalTransactionId?: string;

  @Property({ type: 'string', length: 20 })
  status: string;

  @Property({ type: 'uuid', nullable: true })
  referenceTransactionId?: string;

  @Property({ type: 'string', length: 50, nullable: true })
  failureCode?: string;

  @Property({ type: 'datetime' })
  createdAt: Date;

  @Property({ type: 'datetime', nullable: true })
  processedAt?: Date;

  // Unique: idempotencyKey
  // Unique: providerId + externalTransactionId
}
```

### WalletLedgerEntry Entity

```typescript
@Entity()
export class WalletLedgerEntryEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string;

  @Property({ type: 'uuid' })
  walletId: string;

  @Property({ type: 'uuid' })
  transactionId: string;

  @Property({ type: 'string', length: 6 })
  direction: string;

  @Property({ type: 'decimal', precision: 20, scale: 2 })
  amount: string;

  @Property({ type: 'string', length: 3 })
  currency: string;

  @Property({ type: 'decimal', precision: 20, scale: 2 })
  balanceBefore: string;

  @Property({ type: 'decimal', precision: 20, scale: 2 })
  balanceAfter: string;

  @Property({ type: 'datetime' })
  createdAt: Date;

  // Unique: transactionId
  // Check: direction IN ('DEBIT', 'CREDIT')
  // Check: amount >= 0, balanceBefore >= 0, balanceAfter >= 0
}
```

## Migrations DDL

```sql
-- 001_create_wallets.sql
CREATE TABLE wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id       UUID NOT NULL,
    currency        CHAR(3) NOT NULL,
    balance_amount  NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (balance_amount >= 0),
    version         INTEGER NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_wallet_player_currency UNIQUE (player_id, currency)
);

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
```

## Services

| Service | Responsabilidade |
|---------|-----------------|
| `WalletService` | Criar, consultar e atualizar wallets |
| `WagerTransactionService` | Criar, consultar e transicionar transações |
| `LedgerService` | Consultar ledger e reconciliar saldo |

## Ordem de Implementação (TDD)

1. `Money` — value object com testes de unidade
2. `FailureCode` — taxonomia de falhas
3. `WalletLedgerEntry` — lançamento imutável com testes
4. `Wallet` — aggregate root com debit/credit e testes
5. `WagerTransaction` — transação com estados e testes
6. Entities MikroORM mapeadas
7. Repositórios com MikroORM
8. Migrations DDL
9. Services de aplicação

## Dependências

- `decimal.js-light` para precisão decimal
