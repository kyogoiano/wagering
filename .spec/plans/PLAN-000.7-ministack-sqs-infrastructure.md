# PLAN-000.7: MiniStack SQS Infrastructure & Documentation

## Módulos NestJS

### SQS Module (`src/infrastructure/messaging/sqs/`)

```
src/infrastructure/messaging/sqs/
├── sqs.module.ts              # Módulo com SQSClient, fila creation, consumer
├── sqs.config.ts              # registerAs('sqs') com endpoint, region, credentials
├── sqs-client.factory.ts      # Factory que cria SQSClient e cria filas na inicialização
├── consumer/
│   ├── sqs-consumer.service.ts      # Polling loop, receiveMessage, deleteMessage
│   └── sqs-consumer.handler.ts      # Deserializa mensagem e chama ProcessTransaction
└── outbox/
    └── outbox-publisher.worker.ts   # Worker @Cron que publica eventos pendentes
```

### Configuração

**sqs.config.ts:**

```typescript
import { registerAs } from '@nestjs/config';

export default registerAs('sqs', () => ({
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
  region: process.env.AWS_REGION || 'us-east-1',
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
  queueName: process.env.SQS_QUEUE_NAME || 'wager-transactions.fifo',
  dlqName: process.env.SQS_DLQ_NAME || 'wager-transactions-dlq.fifo',
  pollingIntervalMs: parseInt(process.env.SQS_POLLING_INTERVAL_MS || '1000', 10),
  visibilityTimeoutSeconds: parseInt(process.env.SQS_VISIBILITY_TIMEOUT || '30', 10),
  maxReceiveCount: parseInt(process.env.SQS_MAX_RECEIVE_COUNT || '3', 10),
  consumerName: process.env.SQS_CONSUMER_NAME || 'jungle-wager-consumer',
}));
```

### SQS Client Factory

Na inicialização do módulo:

1. Cria `SQSClient` com endpoint MiniStack
2. Cria DLQ (`wager-transactions-dlq.fifo`) se não existir
3. Cria fila principal (`wager-transactions.fifo`) com `redrivePolicy` apontando para DLQ
4. Registra `SQSClient` como provider injetável

### SQS Consumer

**Fluxo:**

1. `@Cron` ou polling loop chama `receiveMessage`
2. Para cada mensagem:
   a. Deserializa payload JSON
   b. Verifica inbox — se já processada, ack e continua
   c. Chama `ProcessTransaction` use case (mesmo da API HTTP)
   d. Registra inbox como processado na mesma transação SQL
   e. Após commit, chama `deleteMessage` (ack)
   f. Se erro de negócio → ack sem retry
   g. Se erro de infraestrutura → deixa a mensagem na fila (visibility timeout controla retry)

**Graceful Shutdown:**

1. Escuta `SIGTERM` / `SIGINT`
2. Seta `shuttingDown = true` para parar novo polling
3. Aguarda mensagens em andamento com timeout (ex: 10s)
4. Se timeout excedido, mensagens retornam à fila automaticamente (visibility timeout)

### Outbox Publisher Worker

**Fluxo:**

1. `@Cron('*/15 * * * * *')` — a cada 15 segundos
2. `SELECT * FROM outbox_messages WHERE published_at IS NULL AND next_attempt_at <= NOW() ORDER BY occurred_at LIMIT 50 FOR UPDATE SKIP LOCKED`
3. Para cada mensagem:
   a. Serializa payload JSON
   b. Publica para o destino (log por padrão, SQS se configurado)
   c. Marca `published_at = NOW()`
   d. Se falha, incrementa `attempts` e calcula `next_attempt_at` com backoff

## Dependências

| Pacote | Versão | Propósito |
|--------|--------|-----------|
| `@aws-sdk/client-sqs` | ^3.x | AWS SDK v3 para SQS |
| `@aws-sdk/lib-storage` | ^3.x | (opcional) para S3 |

## Integração com AppModule

```typescript
@Module({
  imports: [
    // ... existentes
    SqsModule.forRoot(),
  ],
})
export class AppModule {}
```

## Health Check SQS

Atualizar `SqsHealthIndicator` para usar AWS SDK real:

```typescript
async isHealthy(): Promise<HealthIndicatorResult> {
  try {
    await this.sqs.send(new GetQueueUrlCommand({
      QueueName: this.config.queueName,
    }));
    return { status: 'up', detail: { sqs: 'ok' } };
  } catch {
    return { status: 'down', detail: { sqs: 'error' } };
  }
}
```

## Docker Compose

Adicionar MiniStack ao docker-compose.yml existente:

```yaml
services:
  ministack:
    image: ministackorg/ministack:latest
    container_name: jungle-ministack
    ports:
      - '4566:4566'
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:4566']
      interval: 5s
      timeout: 5s
      retries: 10
```

## ARCHITECTURE.md

Criar no projeto raiz com as seções:

1. **Visão Geral** — sistema distribuído de processamento de apostas
2. **Stack Tecnológico** — Bun, NestJS 12, TypeScript 6, MikroORM 7, PostgreSQL, MiniStack SQS, Keycloak
3. **Diagrama de Componentes** — API HTTP, SQS Consumer, Workers, Banco
4. **Estratégia de Concorrência** — pessimistic locking por walletId
5. **Schema do Banco** — 5 tabelas com constraints
6. **Fluxo de Dados** — HTTP e SQS
7. **Decisões Arquiteturais** — escolhas e justificativas
8. **Trade-offs** — alternativas rejeitadas
9. **Limitações** — o que não foi implementado
10. **Autenticação** — Keycloak + OIDC (já implementada)

## README.md

Atualizar com:

1. Pré-requisitos (Bun, Docker, Docker Compose)
2. Setup rápido (docker-compose + bun install + bun run start)
3. Variáveis de ambiente completas
4. Scripts disponíveis
5. API endpoints
6. Estrutura do projeto

## Manuais de Execução

Adicionar seção "Manual de Execução" a cada summary (SPEC-000 a SPEC-000.6) com:

1. Comandos para testar a feature
2. O que observar nos logs/respostas
3. Exemplos de payloads e respostas esperadas
