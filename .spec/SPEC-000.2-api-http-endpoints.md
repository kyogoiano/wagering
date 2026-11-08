# SPEC-000.2: API HTTP Endpoints

## Visão Geral

Define a API REST exposta pelo serviço para criação de wallets, submissão de transações de apostas, consultas, reconciliação e health checks.

## Contexto

A API HTTP é um dos dois canais de entrada do sistema (o outro sendo SQS). Ela permite que provedores de jogos submetam transações de apostas e consultem o estado das wallets e transações. A API deve ser idempotente, com status HTTP semânticos e respostas consistentes.

## Requisitos

### REQ-001: Criar Wallet

**Endpoint:** `POST /wallets`

**Request:**

```json
{
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "initialBalance": { "amount": "1000.00", "currency": "BRL" }
}
```

**Response (201 Created):**

```json
{
  "id": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "balance": { "amount": "1000.00", "currency": "BRL" },
  "version": 1
}
```

**Regras:**

1. O saldo inicial, quando maior que zero, gera uma transação interna OPENING na mesma transação SQL
2. A transação OPENING gera lançamento CREDIT correspondente no ledger
3. Criar wallet duplicada para o mesmo `playerId + currency` falha com 409 Conflict
4. A wallet é criada com `version = 1`

**Critérios de Aceitação:**

- [ ] Wallet criada com saldo inicial retorna 201
- [ ] Saldo inicial gera transação OPENING e lançamento CREDIT
- [ ] Wallet duplicada retorna 409
- [ ] Version inicia em 1

### REQ-002: Consultar Wallet

**Endpoint:** `GET /wallets/:walletId`

**Response (200 OK):**

```json
{
  "id": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "balance": { "amount": "975.00", "currency": "BRL" },
  "version": 3
}
```

**Critérios de Aceitação:**

- [ ] Retorna wallet e saldo atual
- [ ] Wallet inexistente retorna 404

### REQ-003: Consultar Ledger

**Endpoint:** `GET /wallets/:walletId/ledger?cursor=...&limit=50`

**Response (200 OK):**

```json
{
  "entries": [
    {
      "id": "entry-1",
      "transactionId": "txn-1",
      "direction": "DEBIT",
      "money": { "amount": "25.00", "currency": "BRL" },
      "balanceBefore": { "amount": "1000.00", "currency": "BRL" },
      "balanceAfter": { "amount": "975.00", "currency": "BRL" },
      "createdAt": "2026-07-29T15:00:00.000Z"
    }
  ],
  "nextCursor": "cursor-abc123",
  "hasMore": false
}
```

**Regras:**

1. Cursor estável e opaco — o cliente não precisa interpretar o valor
2. Limit padrão 50, máximo 100
3. Ordenação cronológica crescente

**Critérios de Aceitação:**

- [ ] Retorna entradas do ledger com paginação por cursor
- [ ] Cursor é opaco para o cliente
- [ ] Limit respeita máximo de 100

### REQ-004: Submeter Transação

**Endpoint:** `POST /wagering/transactions`

**Headers:**

```
Idempotency-Key: provider-a:transaction-123
```

**Request:**

```json
{
  "providerId": "provider-a",
  "externalTransactionId": "transaction-123",
  "playerId": "0192f28f-5dc0-7d58-bdb2-814ad6a0f4a1",
  "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "roundId": "round-987",
  "gameId": "fortune-chimp",
  "kind": "BET",
  "money": { "amount": "25.00", "currency": "BRL" }
}
```

**Response (200 OK — processada):**

```json
{
  "transactionId": "0192f298-345e-7e38-af88-e43f851a819d",
  "status": "PROCESSED",
  "balance": { "amount": "975.00", "currency": "BRL" },
  "idempotentReplay": false
}
```

**Response (200 OK — replay idempotente):**

```json
{
  "transactionId": "0192f298-345e-7e38-af88-e43f851a819d",
  "status": "PROCESSED",
  "balance": { "amount": "975.00", "currency": "BRL" },
  "idempotentReplay": true
}
```

**Regras de Idempotência:**

1. O header `Idempotency-Key` é obrigatório
2. Default recomendado: `"{providerId}:{externalTransactionId}"`
3. `payloadHash` = hash de JSON canônico (chaves ordenadas) do subconjunto de campos de negócio
4. Requisição idêntica → mesma resposta, `idempotentReplay: true`
5. Mesma key com payload diferente → conflito 409, não replay

**Status HTTP:**

| Situação | Status |
|----------|--------|
| Transação processada com sucesso | 200 |
| Replay idempotente | 200 |
| Payload inválido | 400 |
| Idempotency-Key ausente | 400 |
| Conflito de idempotência (payload diferente) | 409 |
| Wallet não encontrada | 404 |
| Rejeição por regra de negócio | 422 |
| Transação pendente (referência ausente) | 202 |
| Falha de infraestrutura | 503 |

**Critérios de Aceitação:**

- [ ] Idempotency-Key obrigatório, sem ele retorna 400
- [ ] Mesma key + mesmo payload = replay com idempotentReplay: true
- [ ] Mesma key + payload diferente = 409 Conflict
- [ ] Transação rejeitada por saldo insuficiente retorna 422
- [ ] Referência ausente retorna 202

### REQ-005: Consultar Transação

**Endpoint:** `GET /wagering/transactions/:transactionId`

**Response (200 OK):**

```json
{
  "id": "0192f298-345e-7e38-af88-e43f851a819d",
  "providerId": "provider-a",
  "externalTransactionId": "transaction-123",
  "status": "PROCESSED",
  "kind": "BET",
  "money": { "amount": "25.00", "currency": "BRL" },
  "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "processedAt": "2026-07-29T15:00:00.000Z"
}
```

**Critérios de Aceitação:**

- [ ] Retorna transação pelo ID interno
- [ ] Transação inexistente retorna 404

### REQ-006: Consultar Transação por Provedor

**Endpoint:** `GET /providers/:providerId/wagering/transactions/:externalTransactionId`

**Critérios de Aceitação:**

- [ ] Retorna transação por (providerId, externalTransactionId)
- [ ] Transação inexistente retorna 404

### REQ-007: Reconciliação

**Endpoint:** `POST /wallets/:walletId/reconciliation`

**Response (200 OK):**

```json
{
  "walletId": "0192f291-27dd-7d3f-8071-5f8685deef37",
  "storedBalance": { "amount": "975.00", "currency": "BRL" },
  "calculatedBalance": { "amount": "975.00", "currency": "BRL" },
  "difference": { "amount": "0.00", "currency": "BRL" },
  "consistent": true,
  "checkedEntries": 42
}
```

**Regras:**

1. Calcula o saldo somando todos os lançamentos do ledger
2. Compara com o saldo materializado da wallet
3. Divergências são logadas, contabilizadas em métrica e sinalizadas na resposta
4. Divergências **não** são corrigidas silenciosamente

**Critérios de Aceitação:**

- [ ] Saldo consistente retorna `consistent: true` e `difference: 0.00`
- [ ] Saldo inconsistente retorna `consistent: false` com diferença
- [ ] Divergências são logadas e contabilizadas em métrica

### REQ-008: Health Checks

**Endpoints:**

- `GET /health/live` — processo vivo
- `GET /health/ready` — PostgreSQL e SQS alcançáveis

**Regras:**

1. Health checks **não** exigem autenticação
2. Liveness retorna 200 se o processo está rodando
3. Readiness retorna 200 se PostgreSQL e SQS estão alcançáveis, 503 caso contrário

**Critérios de Aceitação:**

- [ ] `/health/live` retorna 200 quando processo está rodando
- [ ] `/health/ready` retorna 200 quando dependências estão disponíveis
- [ ] `/health/ready` retorna 503 quando PostgreSQL ou SQS estão indisponíveis

## Restrições

1. Autenticação dos endpoints: ver Challenge.md §2 (a cargo do candidato)
2. Endpoints de health ficam abertos
3. Status HTTP distinguem claramente as diferentes situações de erro
4. O mesmo use case é reutilizado entre HTTP e SQS

## Dependências

- SPEC-000 (Core Wagering Domain)
- SPEC-000.3 (Concurrency & Idempotency)

## Referências

- [Challenge.md §9](../Challenge.md#9-api-http) — API HTTP
