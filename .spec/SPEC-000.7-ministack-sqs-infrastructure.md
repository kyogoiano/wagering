# SPEC-000.7: MiniStack SQS Infrastructure & Documentation

## Contexto

O Challenge.md exige **AWS SQS via MiniStack** como stack obrigatória (seção 4). Até agora, o projeto possui apenas domain models de inbox/outbox e um health indicator placeholder para SQS. Falta toda a infraestrutura de mensageria real, além da documentação exigida pela seção 14 do Challenge (README.md com setup e comandos, ARCHITECTURE.md com decisões).

## Objetivos

1. Configurar MiniStack no docker-compose para emular SQS localmente
2. Implementar SQS consumer que reutiliza o use case de processamento HTTP
3. Implementar Outbox Publisher Worker para publicar eventos pendentes
4. Criar ARCHITECTURE.md com decisões, trade-offs e limitações
5. Atualizar README.md com setup completo e comandos de execução
6. Adicionar manuais de execução a cada summary

## Requisitos

### REQ-001: MiniStack no Docker Compose

**Prioridade:** Alta  
**Challenge.md referência:** Seção 4 (Stack Obrigatória)

O serviço MiniStack deve rodar como container no docker-compose junto com PostgreSQL e Keycloak.

**Contrato:**

| Parâmetro | Valor |
|-----------|-------|
| Imagem | `ministackorg/ministack:latest` |
| Porta | `4566:4566` |
| Região | `us-east-1` |
| Credenciais | `test` / `test` (padrão MiniStack) |
| Endpoint | `http://localhost:4566` |

**Critérios de Aceitação:**

1. `docker-compose up -d` inicia MiniStack na porta 4566
2. O health check `/health/ready` verifica conectividade com MiniStack
3. As filas FIFO são criadas automaticamente na inicialização da aplicação

### REQ-002: Filas SQS FIFO

**Prioridade:** Alta  
**Challenge.md referência:** Seção 10 (Processamento por SQS)

Duas filas FIFO devem ser configuradas:

| Fila | Propósito |
|------|-----------|
| `wager-transactions.fifo` | Entrada de transações de apostas |
| `wager-transactions-dlq.fifo` | Dead Letter Queue para mensagens falhas |

**Critérios de Aceitação:**

1. Filas criadas via AWS SDK v3 na inicialização do AppModule
2. A DLQ é referenciada na configuração da fila principal com `redrivePolicy`
3. `maxReceiveCount` configurado (sugerido: 3 tentativas antes da DLQ)

### REQ-003: SQS Consumer

**Prioridade:** Alta  
**Challenge.md referência:** Seção 10 (Processamento por SQS)

Um consumidor assíncrono processa mensagens da fila `wager-transactions.fifo`, reutilizando o mesmo use case da entrada HTTP.

**Contrato:**

A mensagem SQS tem o formato definido no Challenge.md §10:

```json
{
  "messageId": "msg-123",
  "type": "WagerTransactionRequested",
  "occurredAt": "2026-07-29T15:00:00.000Z",
  "data": {
    "providerId": "provider-a",
    "externalTransactionId": "transaction-123",
    "idempotencyKey": "provider-a:transaction-123",
    "playerId": "...",
    "walletId": "...",
    "roundId": "round-987",
    "gameId": "fortune-chimp",
    "kind": "BET",
    "money": { "amount": "25.00", "currency": "BRL" }
  }
}
```

**Comportamento obrigatório:**

1. **Deduplicação via inbox persistente** por `(consumerName, messageId)` — Challenge.md §10
2. **Reutilizar o mesmo use case** da entrada HTTP (`ProcessTransaction`)
3. **Ack somente após commit** da transação SQL — Challenge.md §10
4. **Erros de negócio** → terminal, ack a mensagem (não retry)
5. **Erros transitórios** → retry com backoff exponencial
6. **Erros permanentes** → enviar para DLQ
7. **SIGTERM graceful** — concluir mensagens em andamento ou devolver visibilidade
8. **Redelivery segura** — não duplicar efeitos se a mensagem for redeliverada

**Critérios de Aceitação:**

1. Mensagem válida é processada, inbox registrado, e mensagem acknowledgeada
2. Mensagem duplicada (mesmo messageId) é deduplicada pelo inbox
3. Erro de negócio (saldo insuficiente) resulta em ack sem retry
4. Erro de infraestrutura (banco indisponível) resulta em retry com backoff
5. Após `maxReceiveCount` tentativas, mensagem vai para DLQ
6. SIGTERM pausa polling e aguarda mensagens em andamento

### REQ-004: Outbox Publisher Worker

**Prioridade:** Alta  
**Challenge.md referência:** Seção 11 (Transactional Outbox)

Um worker periodicamente verifica a tabela `outbox_messages` para eventos pendentes e os publica.

**Comportamento obrigatório:**

1. Busca mensagens onde `publishedAt IS NULL` e `nextAttemptAt <= NOW()`
2. Publica o evento para o destino configurado (log, SQS, etc.)
3. Marca como `publishedAt = NOW()` após sucesso
4. Suporta **múltiplos publishers concorrentes** sem duplicação indefinida
5. Usa **lock pessimistic** ou **SELECT ... FOR UPDATE SKIP LOCKED** para evitar que dois workers publiquem a mesma mensagem

**Critérios de Aceitação:**

1. Evento pendente na outbox é publicado dentro do intervalo configurado
2. Dois workers concorrentes não publicam o mesmo evento duas vezes
3. Falha na publicação agenda retry com backoff exponencial
4. Worker funciona após reinicialização do processo (recupera eventos pendentes)

### REQ-005: AWS SDK v3 Configuration

**Prioridade:** Alta

Configurar o AWS SDK v3 para apontar para MiniStack local.

**Contrato:**

```typescript
const sqs = new SQSClient({
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  },
});
```

**Critérios de Aceitação:**

1. SDK aponta para MiniStack local por padrão
2. Variáveis de ambiente permitem override para AWS real
3. ConfigModule.forFeature registra a configuração como 'sqs'

### REQ-006: ARCHITECTURE.md

**Prioridade:** Alta  
**Challenge.md referência:** Seção 14 (Documentação = 5 pontos)

Criar `ARCHITECTURE.md` no projeto raiz com:

1. **Decisões arquiteturais** — stack, padrões, justificativas
2. **Trade-offs** — escolhas entre alternativas e por que foram rejeitadas
3. **Limitações** — o que não foi implementado e por quê
4. **Diagrama de componentes** — API HTTP, SQS consumer, workers, banco
5. **Estratégia de concorrência** — pessimistic locking por walletId
6. **Schema do banco** — tabelas, constraints, índices
7. **Fluxo de dados** — HTTP → use case → domínio → persistência → outbox
8. **Fluxo de dados** — SQS → inbox → use case → domínio → persistência → outbox
9. **Ponto de extensão** — onde a autenticação se encaixa (já implementada)

### REQ-007: README.md Completo

**Prioridade:** Alta  
**Challenge.md referência:** Seção 14 (Documentação = 5 pontos)

Atualizar `README.md` com:

1. **Pré-requisitos** — Bun, Docker, Docker Compose
2. **Setup** — comandos para iniciar infraestrutura e aplicação
3. **Variáveis de ambiente** — tabela completa com defaults
4. **Scripts** — `bun run start`, `bun test`, `bun test:integration`, `bun run typecheck`
5. **API Endpoints** — lista de endpoints com métodos HTTP
6. **Testes de concorrência** — como executar e interpretar resultados
7. **Estrutura do projeto** — árvore de diretórios

### REQ-008: Manuais de Execução nos Summaries

**Prioridade:** Média

Cada summary (SPEC-000 a SPEC-000.6) deve incluir uma seção **"Manual de Execução"** com:

1. **Como testar** — comandos específicos para exercitar a feature
2. **Como verificar** — o que observar nos logs/respostas
3. **Cenários de teste** — exemplos de payloads e respostas esperadas

## Regras de Negócio

### BIZ-001: Inbox Deduplicação

Uma mensagem com o mesmo `(consumerName, messageId)` já processada é ignorada silenciosamente — não reprocessa, não gera erro.

### BIZ-002: Atomicidade Inbox-Transação-Outbox

Inbox, alteração financeira, ledger e outbox participam da **mesma transação SQL** — Challenge.md §6.5.

### BIZ-003: Ack Após Commit

A mensagem SQS é acknowledgeada **somente após** o commit da transação SQL — Challenge.md §10.

### BIZ-004: Graceful Shutdown

Em SIGTERM, o consumer pausa o polling e aguarda as mensagens em andamento completarem (com timeout configurável).

## Eventos de Integração

Os eventos definidos no Challenge.md §11 são publicados na outbox:

| Evento | Quando |
|--------|--------|
| `WagerTransactionProcessed` | Qualquer transação aplicada, inclusive LOSS |
| `WagerTransactionRejected` | Transação rejeitada por regra de negócio |
| `WalletBalanceChanged` | Somente quando o saldo muda |
| `WagerTransactionPendingReference` | Referência ausente |

## Critérios de Aceitação Globais

1. MiniStack roda no docker-compose na porta 4566
2. Filas FIFO criadas automaticamente na inicialização
3. SQS consumer processa mensagens sem duplicação
4. Outbox publisher publica eventos pendentes
5. ARCHITECTURE.md existe no projeto raiz com todas as seções
6. README.md contém setup completo e comandos
7. Todos os 7 summaries anteriores têm seção "Manual de Execução"
8. `bun test src/` continua passando (247 testes)
