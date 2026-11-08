# TASKS-000.3: Concurrency & Idempotency

## Tarefas em Ordem TDD

### 1. Idempotência

- [ ] **T102:** Implementar `calculatePayloadHash()` com JSON canônico
- [ ] **T103:** Escrever testes para payload hash — mesma entrada = mesmo hash
- [ ] **T104:** Implementar `IdempotencyService` — verificar e registrar keys
- [ ] **T105:** Escrever testes para replay idempotente
- [ ] **T106:** Escrever testes para conflito de idempotência (payload diferente)

### 2. Pessimistic Locking

- [ ] **T107:** Implementar wrapper para `SELECT ... FOR UPDATE` com MikroORM
- [ ] **T108:** Escrever teste de integração — duas operações concorrentes serializadas

### 3. Use Case Compartilhado

- [ ] **T109:** Implementar `SubmitWagerTransactionHandler` compartilhado HTTP/SQS
- [ ] **T110:** Escrever testes para o fluxo completo com lock e idempotência

### 4. Worker PENDING_REFERENCE

- [ ] **T111:** Implementar `PendingReferenceWorker` com cron
- [ ] **T112:** Implementar resolução de referência por (providerId, externalTransactionId)
- [ ] **T113:** Implementar backoff exponencial para retries
- [ ] **T114:** Implementar rejeição após TTL com REFERENCE_NOT_FOUND
- [ ] **T115:** Escrever testes para referência fora de ordem

### 5. Testes de Concorrência

- [ ] **T116:** Implementar teste — 2 apostas de 80 BRL com saldo 100 BRL
- [ ] **T117:** Implementar teste — 50 apostas idênticas em paralelo
- [ ] **T118:** Implementar teste — wallets diferentes em paralelo
- [ ] **T119:** Implementar teste — ≥3 instâncias simultâneas
