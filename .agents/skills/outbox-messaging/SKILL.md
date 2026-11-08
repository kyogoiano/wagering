# Skill: Outbox Messaging

## Descrição

Skill para implementação de mensageria confiável com outbox pattern, garantindo que eventos de integração nunca sejam perdidos.

## Princípios

1. **Atomicidade** — Evento inserido na outbox na mesma transação SQL que a alteração de negócio
2. **Publicação após commit** — Eventos são publicados apenas após o commit da transação
3. **Retry com backoff** — Falhas de publicação são retradas com backoff exponencial
4. **Concurrent publishers** — Múltiplos workers competem por eventos com SKIP LOCKED

## Padrões

- **Outbox table** — Armazena eventos pendentes com attempts, nextAttemptAt, publishedAt
- **SKIP LOCKED** — `SELECT ... FOR UPDATE SKIP LOCKED` para concurrent publishers
- **Backoff exponencial** — `delay = min(baseDelay * 2^attempt, maxDelay)`
- **DLQ** — Eventos com attempts esgotados são marcados como falha permanente

## Armadilhas Comuns

- Publicar evento antes do commit → evento perdido se commit falhar
- Dois publishers publicam o mesmo evento → duplicação
- Não usar SKIP LOCKED → deadlock entre publishers
- Não marcar como publicado → evento repubblicado infinitamente

## Referências

- [SPEC-000.1](../../.spec/SPEC-000.1-inbox-outbox-messaging.md) — Inbox & Outbox
- [ARCH-000](../../.spec/architecture/ARCH-000-distributed-wagering-processor.md) — Fluxo Outbox
