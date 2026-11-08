# SPEC-000.3: Concurrency & Idempotency

## Visão Geral

Define a estratégia de controle de concorrência e idempotência persistente que garante correção financeira quando múltiplas instâncias do sistema processam operações da mesma wallet simultaneamente.

## Contexto

A unidade de concorrência é a `walletId`. O sistema deve permanecer correto quando:

- Duas apostas disputam o mesmo saldo
- Múltiplos workers recebem operações da mesma wallet
- Wallets diferentes são processadas em paralelo
- Três ou mais instâncias rodam simultaneamente

A estratégia de lock é escolha do implementador, mas deve ser justificada em ARCHITECTURE.md.

## Requisitos

### REQ-001: Estratégia de Lock por Wallet

**Descrição:** Mecanismo que garante que apenas uma operação por wallet seja processada por vez, evitando lost updates.

**Estratégia Proposta: Pessimistic Locking com `SELECT ... FOR UPDATE`**

A estratégia utiliza locks pessimistas do PostgreSQL via MikroORM `LockMode.PESSIMISTIC_WRITE` para garantir serialização de operações na mesma wallet.

**Fluxo:**

1. Iniciar transação SQL
2. Carregar wallet com `SELECT ... FOR UPDATE` — bloqueia a linha até o commit
3. Aplicar a operação (debit/credit)
4. Persistir wallet, ledger entry, e outbox event na mesma transação
5. Commit — libera o lock

**Alternativa: Optimistic Locking com `version`**

Se a estratégia escolhida for optimistic locking:

1. Carregar wallet com `version` atual
2. Aplicar a operação
3. Atualizar com `WHERE version = :expectedVersion`
4. Se 0 linhas afetadas → retry com limite
5. Após retries esgotados → rejeitar com `CONCURRENT_MODIFICATION`

**Critérios de Aceitação:**

- [ ] Duas operações concorrentes na mesma wallet são serializadas
- [ ] Nenhuma operação é perdida (lost update)
- [ ] Wallets diferentes são processadas em paralelo sem bloqueio mútuo
- [ ] Lock não é global — não bloqueia wallets diferentes

### REQ-002: Idempotência Persistente

**Descrição:** Garantia de que a mesma operação submetida múltiplas vezes produz o mesmo efeito exatamente uma vez.

**Mecanismo:**

1. A `idempotencyKey` é única no banco — unique constraint
2. Ao receber uma operação, o sistema verifica se a key já existe
3. Se existe e o `payloadHash` bate → retorna o resultado original (replay)
4. Se existe e o `payloadHash` não bate → retorna conflito 409
5. Se não existe → processa normalmente

**Schema:**

```sql
ALTER TABLE wager_transactions
  ADD CONSTRAINT uq_idempotency_key UNIQUE (idempotency_key);
```

**Payload Hash:**

- Calculado a partir de JSON canônico (chaves ordenadas) do subconjunto de campos de negócio
- Campos incluídos: `providerId`, `externalTransactionId`, `playerId`, `walletId`, `roundId`, `gameId`, `kind`, `money.amount`, `money.currency`
- Campos excluídos: headers, metadados de transporte, timestamps
- Algoritmo: SHA-256

**Critérios de Aceitação:**

- [ ] Mesma idempotencyKey + mesmo payload = replay idempotente
- [ ] Mesma idempotencyKey + payload diferente = conflito 409
- [ ] Idempotência funciona após restart do processo (persistente)
- [ ] Não usar cache em memória como garantia de idempotência

### REQ-003: Cenário Obrigatório — Concorrência de Saldo

**Descrição:** Cenário que deve funcionar corretamente sob concorrência real.

**Cenário:**

- Saldo inicial: 100.00 BRL
- Duas apostas de 80.00 BRL processadas simultaneamente

**Resultado Esperado:**

- Exatamente uma aposta PROCESSED
- A outra REJECTED por saldo insuficiente (`INSUFFICIENT_BALANCE`)
- Saldo final: 20.00 BRL
- Exatamente um lançamento de débito no ledger
- Nenhum retry duplica o débito

**Critérios de Aceitação:**

- [ ] Executar 100 vezes o cenário com 2 processos concorrentes
- [ ] Em todas as execuções: 1 PROCESSED, 1 REJECTED
- [ ] Saldo final sempre 20.00 BRL
- [ ] Exatamente 1 débito no ledger
- [ ] Nenhum saldo negativo em nenhum momento

### REQ-004: Worker PENDING_REFERENCE

**Descrição:** Worker agendado que reprocessa transações com estado `PENDING_REFERENCE` quando a referência referenciada se torna disponível.

**Fluxo:**

1. A cada intervalo, buscar transações `PENDING_REFERENCE` com `nextAttemptAt <= now`
2. Para cada transação, tentar resolver a referência por `(providerId, referenceExternalTransactionId)`
3. Se encontrada e válida → processar a transação
4. Se não encontrada → agendar retry com backoff exponencial
5. Se attempts excedem limite → REJECT com `REFERENCE_NOT_FOUND`

**Backoff:**

```
delay = min(baseDelay * 2^attempt, maxDelay)
```

Com `baseDelay = 5s`, `maxDelay = 300s`, `maxAttempts = 10`, `TTL = 5min`.

**Critérios de Aceitação:**

- [ ] Transação PENDING_REFERENCE é reprocessada quando referência aparece
- [ ] Backoff exponencial entre tentativas
- [ ] Após TTL, transação é REJECTED com `REFERENCE_NOT_FOUND`
- [ ] Evento `WagerTransactionPendingReference` é publicado

### REQ-005: Múltiplas Instâncias

**Descrição:** A solução deve estar correta com múltiplas instâncias da aplicação.

**Regras:**

1. Os locks são gerenciados pelo banco de dados, não pela aplicação
2. Múltiplos processos competem pelo lock da mesma wallet via o banco
3. O processo que não consegue o lock espera ou retry
4. Não usar lock global compartilhado por todas as wallets

**Critérios de Aceitação:**

- [ ] ≥3 instâncias simultâneas processam corretamente
- [ ] Nenhuma instância causa saldo negativo
- [ ] Nenhuma operação é duplicada entre instâncias

## Restrições

1. Não usar lock global compartilhado por todas as wallets
2. Não implementar saldo como read → calculate → update sem controle de concorrência
3. A solução deve estar correta com múltiplas instâncias
4. Recursos de ordenação do broker são otimização, não garantia final
5. O banco é responsável pelas invariantes finais

## Dependências

- SPEC-000 (Core Wagering Domain)

## Referências

- [Challenge.md §8](../Challenge.md#8-concorrencia-e-ordenacao) — Concorrência e ordenação
- [Challenge.md §9](../Challenge.md#9-api-http) — Idempotência na API
