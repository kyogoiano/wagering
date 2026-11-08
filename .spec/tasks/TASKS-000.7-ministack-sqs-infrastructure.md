# TASKS-000.7: MiniStack SQS Infrastructure & Documentation

## Ordem TDD

As tarefas são executadas em ordem TDD: primeiro os testes, depois a implementação.

---

### T160: Configurar MiniStack no Docker Compose

**Spec:** REQ-001  
**Depende de:** Nenhuma

- [ ] T160.1 — Adicionar serviço `ministack` ao `docker-compose.yml` com imagem `ministackorg/ministack:latest`, porta 4566 e health check
- [ ] T160.2 — Verificar `docker-compose up -d` inicia MiniStack sem erros
- [ ] T160.3 — Teste: health check `/health/ready` verifica conectividade com MiniStack via AWS SDK

---

### T161: Instalar e configurar AWS SDK v3

**Spec:** REQ-005  
**Depende de:** T160

- [ ] T161.1 — Instalar `@aws-sdk/client-sqs`
- [ ] T161.2 — Criar `sqs.config.ts` com `registerAs('sqs')` e 9 variáveis de ambiente
- [ ] T161.3 — Teste unitário: config retorna defaults quando env vars não estão setadas
- [ ] T161.4 — Teste unitário: config usa valores customizados quando env vars estão setadas

---

### T162: Criar SQS Client Factory com fila creation

**Spec:** REQ-002  
**Depende de:** T161

- [ ] T162.1 — Criar `sqs-client.factory.ts` que instancia `SQSClient` com endpoint MiniStack
- [ ] T162.2 — Implementar criação da DLQ (`wager-transactions-dlq.fifo`) com `CreateQueueCommand`
- [ ] T162.3 — Implementar criação da fila principal com `redrivePolicy` apontando para DLQ
- [ ] T162.4 — Teste: filas são criadas na inicialização do módulo (mock SQS)
- [ ] T162.5 — Teste: fila principal tem `redrivePolicy` com `deadLetterTargetArn` correto

---

### T163: Criar SQS Module

**Spec:** REQ-002  
**Depende de:** T162

- [ ] T163.1 — Criar `sqs.module.ts` com `forRoot()` static method
- [ ] T163.2 — Registrar `SQSClient` como provider injetável via token
- [ ] T163.3 — Importar `ConfigModule.forFeature(sqsConfig)`
- [ ] T163.4 — Adicionar `SqsModule.forRoot()` ao `AppModule`

---

### T164: Implementar SQS Consumer

**Spec:** REQ-003  
**Depende de:** T163

- [ ] T164.1 — Criar `sqs-consumer.service.ts` com polling loop
- [ ] T164.2 — Implementar `receiveMessage` com `WaitTimeSeconds`, `MaxNumberOfMessages`
- [ ] T164.3 — Implementar deserialização do payload JSON conforme Challenge.md §10
- [ ] T164.4 — Integrar com `ProcessTransaction` use case (mesmo da API HTTP)
- [ ] T164.5 — Implementar inbox deduplicação: verificar `(consumerName, messageId)` antes de processar
- [ ] T164.6 — Implementar `deleteMessage` (ack) após commit da transação SQL
- [ ] T164.7 — Erros de negócio → ack sem retry
- [ ] T164.8 — Erros de infraestrutura → deixar mensagem na fila (visibility timeout)
- [ ] T164.9 — Teste unitário: mensagem válida é processada e acknowledgeada (mock SQS)
- [ ] T164.10 — Teste unitário: mensagem duplicada é deduplicada pelo inbox
- [ ] T164.11 — Teste unitário: erro de negócio resulta em ack sem retry

---

### T165: Implementar Graceful Shutdown

**Spec:** REQ-003  
**Depende de:** T164

- [ ] T165.1 — Escutar `SIGTERM` / `SIGINT` no `main.ts` ou no consumer service
- [ ] T165.2 — Seta `shuttingDown = true` para parar novo polling
- [ ] T165.3 — Aguardar mensagens em andamento com timeout configurável
- [ ] T165.4 — Teste: SIGTERM pausa polling e aguarda mensagens em andamento

---

### T166: Implementar Outbox Publisher Worker

**Spec:** REQ-004  
**Depende de:** T163

- [ ] T166.1 — Criar `outbox-publisher.worker.ts` com `@Cron` a cada 15 segundos
- [ ] T166.2 — Query `SELECT ... FOR UPDATE SKIP LOCKED` para mensagens pendentes
- [ ] T166.3 — Publicar evento para o destino (log por padrão)
- [ ] T166.4 — Marcar `published_at = NOW()` após sucesso
- [ ] T166.5 — Incrementar `attempts` e calcular `next_attempt_at` com backoff em falha
- [ ] T166.6 — Teste unitário: evento pendente é publicado
- [ ] T166.7 — Teste unitário: falha agenda retry com backoff exponencial

---

### T167: Atualizar SqsHealthIndicator

**Spec:** REQ-001  
**Depende de:** T163

- [ ] T167.1 — Injetar `SQSClient` no `SqsHealthIndicator`
- [ ] T167.2 — Usar `GetQueueUrlCommand` para verificar conectividade real
- [ ] T167.3 — Teste: health retorna `up` quando MiniStack está disponível
- [ ] T167.4 — Teste: health retorna `down` quando MiniStack está indisponível

---

### T168: Criar ARCHITECTURE.md

**Spec:** REQ-006  
**Depende de:** Nenhuma

- [ ] T168.1 — Visão Geral: sistema distribuído de processamento de apostas
- [ ] T168.2 — Stack Tecnológico: Bun, NestJS 12, TypeScript 6, MikroORM 7, PostgreSQL, MiniStack, Keycloak
- [ ] T168.3 — Diagrama de Componentes: API HTTP, SQS Consumer, Workers, Banco
- [ ] T168.4 — Estratégia de Concorrência: pessimistic locking por walletId
- [ ] T168.5 — Schema do Banco: 5 tabelas com constraints e índices
- [ ] T168.6 — Fluxo de Dados HTTP: request → controller → service → domínio → persistência → outbox
- [ ] T168.7 — Fluxo de Dados SQS: mensagem → consumer → inbox → use case → domínio → persistência → outbox
- [ ] T168.8 — Decisões Arquiteturais: escolhas e justificativas
- [ ] T168.9 — Trade-offs: alternativas rejeitadas
- [ ] T168.10 — Limitações: o que não foi implementado
- [ ] T168.11 — Autenticação: Keycloak + OIDC (já implementada)

---

### T169: Atualizar README.md

**Spec:** REQ-007  
**Depende de:** T168

- [ ] T169.1 — Pré-requisitos: Bun, Docker, Docker Compose
- [ ] T169.2 — Setup rápido: `docker-compose up -d && bun install && bun run start`
- [ ] T169.3 — Tabela de variáveis de ambiente com defaults
- [ ] T169.4 — Scripts: `start`, `test`, `test:integration`, `typecheck`
- [ ] T169.5 — API endpoints: lista com métodos HTTP
- [ ] T169.6 — Estrutura do projeto: árvore de diretórios

---

### T170: Adicionar Manuais de Execução aos Summaries

**Spec:** REQ-008  
**Depende de:** Nenhuma

- [ ] T170.1 — SUMMARY-000: Manual de Execução (testes unitários do domínio)
- [ ] T170.2 — SUMMARY-000.1: Manual de Execução (inbox/outbox messaging)
- [ ] T170.3 — SUMMARY-000.2: Manual de Execução (API HTTP endpoints)
- [ ] T170.4 — SUMMARY-000.3: Manual de Execução (concorrência e idempotência)
- [ ] T170.5 — SUMMARY-000.4: Manual de Execução (observabilidade e health)
- [ ] T170.6 — SUMMARY-000.5: Manual de Execução (testes de concorrência)
- [ ] T170.7 — SUMMARY-000.6: Manual de Execução (autenticação Keycloak)

---

### T171: Atualizar índices do projeto

**Depende de:** T168, T169

- [ ] T171.1 — Atualizar `.spec/README.md` com SPEC-000.7
- [ ] T171.2 — Atualizar `.spec/ROADMAP.md` com Fase 8 (MiniStack)
- [ ] T171.3 — Criar `.spec/summaries/SUMMARY-000.7-ministack-sqs-infrastructure.md` (estrutura vazia)
- [ ] T171.4 — Atualizar `.junie/plans/setup-jungle-sdd-structure.md` com status do Step 3

---

### T172: Garantir testes existentes continuam passando

**Depende de:** T160–T171

- [ ] T172.1 — `bun test src/` — 247 testes passando
- [ ] T172.2 — `bun run typecheck` — 0 erros de tipo
