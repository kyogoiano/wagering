# SPEC-000.1: Inbox & Outbox Messaging

## Visão Geral

Define o mecanismo de mensageria confiável com inbox persistente para deduplicação de mensagens SQS e outbox transacional para publicação de eventos de integração, garantindo processamento exatamento-uma-vez.

## Contexto

O sistema recebe transações de apostas via AWS SQS (FIFO) com entrega at-least-once. Para garantir correção financeira, é necessário:

- Deduplicar mensagens via inbox persistente antes de processar
- Publicar eventos de integração apenas após commit da transação financeira
- Recuperar eventos não publicados após crash do processo
- Suportar múltiplos publishers concorrentes sem perder nem duplicar eventos

## Requisitos

### REQ-001: InboxMessage — Deduplicação Persistente

**Descrição:** Registro persistente que rastreia mensagens recebidas do SQS para evitar processamento duplicado.

**Contrato:**

```typescript
class InboxMessage {
  private constructor(
    public readonly messageId: string,
    public readonly consumerName: string,
    public readonly payloadHash: string,
    public readonly receivedAt: Date,
    private _processedAt?: Date,
  ) {}

  static receive(props: ReceiveInboxProps): InboxMessage;
  static rehydrate(state: InboxMessageState): InboxMessage;

  get processedAt(): Date | undefined;
  isProcessed(): boolean;
  markProcessed(at: Date): void;
}
```

**Regras:**

1. Deduplicação por `(consumerName, messageId)` — unique constraint no banco
2. Uma mensagem já processada não é processada novamente
3. O inbox é verificado antes de qualquer lógica de negócio
4. Se a mensagem já existe no inbox como processada, retorna o resultado original

**Critérios de Aceitação:**

- [ ] Mensagem duplicada é detectada antes do processamento
- [ ] `(consumerName, messageId)` é único no banco
- [ ] Redelivery após crash não duplica efeitos
- [ ] Mensagens de consumers diferentes não conflitam

### REQ-002: OutboxMessage — Fila de Eventos Pendentes

**Descrição:** Fila interna que armazena eventos de integração pendentes de publicação, garantindo que nenhum evento seja perdido.

**Contrato:**

```typescript
class OutboxMessage {
  private constructor(
    public readonly id: string,
    public readonly aggregateId: string,
    public readonly eventType: string,
    public readonly payload: Readonly<Record<string, unknown>>,
    public readonly occurredAt: Date,
    private _attempts: number,
    private _nextAttemptAt?: Date,
    private _publishedAt?: Date,
  ) {}

  static enqueue(event: IntegrationEvent<unknown>): OutboxMessage;
  static rehydrate(state: OutboxMessageState): OutboxMessage;

  get attempts(): number;
  get nextAttemptAt(): Date | undefined;
  get publishedAt(): Date | undefined;

  isPending(): boolean;
  isDue(now: Date): boolean;
  markPublished(at: Date): void;
  scheduleRetry(now: Date): void;
}
```

**Regras:**

1. Eventos são inseridos na outbox na mesma transação SQL que a alteração financeira
2. Um worker publica os eventos pendentes com retry e backoff exponencial
3. Múltiplos publishers concorrentes podem pegar eventos da mesma outbox sem duplicar
4. Após publicação bem-sucedida, o evento é marcado como publicado
5. Após falha, o evento agenda retry com backoff exponencial

**Critérios de Aceitação:**

- [ ] Evento inserido na mesma transação que a alteração financeira
- [ ] Worker publica eventos pendentes sem duplicação
- [ ] Múltiplos publishers não publicam o mesmo evento duas vezes
- [ ] Retry com backoff exponencial após falha
- [ ] Crash após commit não perde eventos

### REQ-003: SQS Consumer — Consumidor de Mensagens

**Descrição:** Serviço que consome mensagens da fila `wager-transactions.fifo` e as processa com deduplicação via inbox.

**Fluxo:**

1. Receber mensagem do SQS
2. Verificar inbox por `(consumerName, messageId)` — se já processada, ack e retornar
3. Calcular `payloadHash` do payload canônico
4. Inserir registro no inbox
5. Executar o mesmo use case da entrada HTTP
6. Após commit SQL, ack a mensagem no SQS
7. Em caso de erro de negócio (terminal), ack a mensagem
8. Em caso de erro transitório, deixar para retry do SQS
9. Em caso de erro permanente, enviar para DLQ

**Critérios de Aceitação:**

- [ ] Mensagem duplicada é acked sem processar
- [ ] Ack somente após commit SQL
- [ ] Erro de negócio terminal → ack, não retry
- [ ] Erro transitório → retry com backoff
- [ ] Erro permanente → DLQ
- [ ] SIGTERM conclui mensagens em andamento

### REQ-004: Outbox Publisher/Worker — Publicador de Eventos

**Descrição:** Worker que publica eventos pendentes da outbox para o sistema de mensageria.

**Fluxo:**

1. Selecionar eventos pendentes e devido (`nextAttemptAt <= now`)
2. Tentar publicar cada evento
3. Sucesso → marcar como publicado na mesma transação
4. Falha → incrementar attempts e calcular próximo `nextAttemptAt` com backoff
5. Se attempts excedem limite → marcar como falha permanente

**Backoff Exponencial:**

```
delay = min(baseDelay * 2^attempt, maxDelay)
```

Com `baseDelay = 1s`, `maxDelay = 60s`, `maxAttempts = 5`.

**Critérios de Aceitação:**

- [ ] Worker funciona com múltiplas instâncias concorrentes
- [ ] Dois workers não publicam o mesmo evento
- [ ] Backoff exponencial entre retries
- [ ] Evento falha após maxAttempts

### REQ-005: Eventos de Integração

**Descrição:** Envelope abstrato e subclasses concretas para cada tipo de evento.

**Contrato:**

```typescript
abstract class IntegrationEvent<T> {
  abstract readonly eventType: string;
  abstract readonly version: number;

  readonly eventId: string;
  readonly aggregateId: string;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly occurredAt: Date;
  readonly data: Readonly<T>;

  toJSON(): {
    eventId: string;
    eventType: string;
    aggregateId: string;
    correlationId: string;
    causationId?: string;
    occurredAt: string;   // ISO-8601
    version: number;
    data: T;
  };
}
```

**Eventos Mínimos:**

| Evento | Quando |
|--------|--------|
| `WagerTransactionProcessed` | Qualquer transação aplicada, inclusive LOSS |
| `WagerTransactionRejected` | Transação rejeitada por regra de negócio |
| `WalletBalanceChanged` | Somente quando o saldo muda |
| `WagerTransactionPendingReference` | Referência ausente |

**Critérios de Aceitação:**

- [ ] `data` carrega `MoneyProps` (string decimal), nunca instância de Money
- [ ] `eventType` e `version` ficam no tipo, não em string solta
- [ ] Payload é JSON estável e versionável
- [ ] Evento não é publicado antes do commit da transação financeira

### REQ-006: DLQ Handler — Fila de Mensagens com Erro

**Descrição:** Gerenciamento de mensagens que excederam o limite de tentativas.

**Regras:**

1. Mensagens com tentativas esgotadas são enviadas para `wager-transactions-dlq.fifo`
2. O payload original é preservado na DLQ
3. Métricas de DLQ são expostas para monitoramento

**Critérios de Aceitação:**

- [ ] Mensagem vai para DLQ após maxAttempts
- [ ] Payload original preservado
- [ ] Métrica de DLQ incrementada

## Restrições

1. Inbox, alteração financeira, ledger e outbox participam da mesma transação SQL
2. Não confiar apenas em SQS FIFO para garantir consistência
3. Não publicar eventos antes do commit da transação financeira
4. Ack somente após commit

## Dependências

- SPEC-000 (Core Wagering Domain)

## Referências

- [Challenge.md §6.5](../Challenge.md#65-inbox-e-outbox) — Inbox e Outbox
- [Challenge.md §10](../Challenge.md#10-processamento-por-sqs) — Processamento por SQS
- [Challenge.md §11](../Challenge.md#11-transactional-outbox) — Transactional Outbox
