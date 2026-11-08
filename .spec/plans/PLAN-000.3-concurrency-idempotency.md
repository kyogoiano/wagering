# PLAN-000.3: Concurrency & Idempotency

## Visão Geral

Plano de implementação da estratégia de concorrência com pessimistic locking e idempotência persistente.

## Módulos NestJS

```
src/
├── application/
│   ├── commands/
│   │   ├── submit-wager-transaction.command.ts
│   │   └── submit-wager-transaction.handler.ts
│   ├── idempotency/
│   │   ├── idempotency.service.ts
│   │   └── payload-hash.util.ts
│   └── workers/
│       └── pending-reference.worker.ts
└── infrastructure/
    └── locking/
        └── pessimistic-lock.strategy.ts
```

## Estratégia de Lock

### Pessimistic Locking com MikroORM

```typescript
// Carregar wallet com lock pessimista
const wallet = await em.findOne(WalletEntity, walletId, {
  lockMode: LockMode.PESSIMISTIC_WRITE,
});

// Aplicar operação dentro da transação
wallet.debit(amount, transactionId);

// Persistir tudo na mesma transação
await em.persist(ledgerEntry);
await em.persist(outboxEvent);
await em.flush();
```

## Idempotência Persistente

### Fluxo

```typescript
async submitTransaction(idempotencyKey: string, payload: SubmitDto) {
  // 1. Calcular payload hash
  const payloadHash = calculatePayloadHash(payload);

  // 2. Tentar inserir com unique constraint
  try {
    const transaction = WagerTransaction.create({
      idempotencyKey,
      payloadHash,
      ...payload
    });
    await em.persist(transaction).flush();
  } catch (uniqueViolation) {
    // 3. Se já existe, verificar payload hash
    const existing = await em.findOne(WagerTransactionEntity, { idempotencyKey });
    if (existing.payloadHash !== payloadHash) {
      throw new IdempotencyConflictError();
    }
    // Replay idempotente
    return { ...existing, idempotentReplay: true };
  }

  // 4. Processar transação
  return processTransaction(transaction);
}
```

### Payload Hash

```typescript
function calculatePayloadHash(payload: SubmitDto): string {
  const canonical = JSON.stringify(
    sortKeys(payload),
    Object.keys(sortKeys(payload)).sort()
  );
  return createHash('sha256').update(canonical).digest('hex');
}
```

## Worker PENDING_REFERENCE

```typescript
@Cron('*/30 * * * * *') // a cada 30 segundos
async processPendingReferences() {
  const pending = await this.transactionRepository.findPendingReferences();
  for (const tx of pending) {
    const reference = await this.resolveReference(tx);
    if (reference) {
      await this.processTransaction(tx, reference);
    } else if (tx.attempts >= MAX_ATTEMPTS) {
      await this.rejectTransaction(tx, FailureCode.REFERENCE_NOT_FOUND);
    } else {
      await this.scheduleRetry(tx);
    }
  }
}
```

## Ordem de Implementação (TDD)

1. `IdempotencyService` — verificar e registrar idempotency keys
2. `PayloadHashUtil` — calcular hash canônico
3. `PessimisticLockStrategy` — wrapper para SELECT ... FOR UPDATE
4. `SubmitWagerTransactionHandler` — use case compartilhado HTTP/SQS
5. `PendingReferenceWorker` — reprocessar referências ausentes
6. Unique constraints no banco
7. Testes de concorrência com múltiplos processos
