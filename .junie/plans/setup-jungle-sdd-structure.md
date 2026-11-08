---
sessionId: session-261108-172613-1n6i
---

# Overview & Goals

### Overview
Este plano estabelece a estrutura **Spec-Driven Design (SDD)** completa para o projeto **Jungle — Distributed Wagering Processor**, seguindo o padrão do projeto `../wallet` como referência, mas adaptado para o stack do challenge: **Bun, TypeScript, NestJS, MikroORM, PostgreSQL, AWS SQS (MiniStack), Keycloak (OIDC)**.

### Goals
- Criar a pasta `.spec/` com todas as especificações do challenge decompostas em slices atômicos
- Criar a pasta `.spec/architecture/` com a definição arquitetural
- Criar a pasta `.spec/plans/` com os planos de implementação por fase
- Criar a pasta `.spec/tasks/` com o breakdown de tarefas TDD
- Criar a pasta `.spec/summaries/` (estrutura vazia, preenchida após implementação)
- Criar a pasta `.agents/` com regras, skills e workflows
- Criar o `ROADMAP.md` descrevendo tudo que será construído conforme o Challenge.md

### Out of Scope
- Configuração do Docker (parte da implementação)

### Implementation Status
- ✓ SPEC-000: Core Wagering Domain (108 testes)
- ✓ SPEC-000.1: Inbox/Outbox Messaging (51 testes)
- ✓ SPEC-000.2: API HTTP Endpoints (controllers, services, repositories)
- ✓ SPEC-000.3: Concurrency/Idempotency (22 testes — IdempotencyService, PendingReferenceWorker, PENDING_REFERENCE)
- ✓ SPEC-000.4: Observability & Health (35 testes — Pino logger, Prometheus metrics, health checks)
- ✓ SPEC-000.5: Tests de concorrência (7 testes de migrations, setup de integração)
- ✓ SPEC-000.6: Auth Keycloak/OIDC (31 testes)
- ⏳ SPEC-000.7: MiniStack SQS, documentação e manuais de execução

# Delivery Steps

### ✓ Step 1: Criar estrutura .spec com specs, README e ROADMAP
Criar a estrutura de diretórios `.spec/` e os arquivos de especificação do challenge.

- Criar diretórios: `.spec/`, `.spec/architecture/`, `.spec/plans/`, `.spec/tasks/`, `.spec/summaries/`
- Criar `.spec/README.md` — índice mestre e taxonomia do projeto jungle
- Criar `.spec/ROADMAP.md` — roadmap estratégico com todas as fases do challenge (6 specs decompostas)
- Criar `.spec/SPEC-000-core-wagering-domain.md` — domínio central (Money, Wallet, WagerTransaction, Ledger, FailureCodes)
- Criar `.spec/SPEC-000.1-inbox-outbox-messaging.md` — inbox persistente, outbox, consumidor SQS, worker outbox, retry e DLQ
- Criar `.spec/SPEC-000.2-api-http-endpoints.md` — endpoints HTTP (wallets, transactions, reconciliation, health)
- Criar `.spec/SPEC-000.3-concurrency-idempotency.md` — estratégia de lock por wallet, idempotência persistente, replay
- Criar `.spec/SPEC-000.4-observability-health.md` — logs estruturados JSON, métricas, health checks live/ready
- Criar `.spec/SPEC-000.5-tests-concurrency.md` — testes de unidade, integração com containers, testes de concorrência real
- Criar `.spec/SPEC-000.6-auth-keycloak-oidc.md` — autenticação via Keycloak, OIDC flows, JWT validation, roles-based authorization

### ✓ Step 2: Criar architecture, plans, tasks, agents, skills e summaries
Criar os documentos complementares de arquitetura, planos, tarefas, agentes, skills e estrutura de summaries.

**Arquitetura:**
- `.spec/architecture/ARCH-000-distributed-wagering-processor.md` — topologia macro, diagramas de componentes, fluxo de dados, estratégia de concorrência, schema PostgreSQL, invariantes autoritativos

**Plans (um por spec):**
- `.spec/plans/PLAN-000-core-wagering-domain.md` — módulos NestJS, entities MikroORM, DDL, factories, services
- `.spec/plans/PLAN-000.1-inbox-outbox-messaging.md` — inbox/outbox pattern, SQS consumer, publisher, retry com backoff
- `.spec/plans/PLAN-000.2-api-http-endpoints.md` — controllers, DTOs, guards, exception filters, idempotency key
- `.spec/plans/PLAN-000.3-concurrency-idempotency.md` — lock pessimistic por walletId, idempotencyKey única, payload hash
- `.spec/plans/PLAN-000.4-observability-health.md` — Pino logger, Prometheus metrics, health indicators
- `.spec/plans/PLAN-000.5-tests-concurrency.md` — testes unitários, integração com Testcontainers, testes de race conditions
- `.spec/plans/PLAN-000.6-auth-keycloak-oidc.md` — Auth module, JWT strategy, guards, Docker Compose, realm config

**Tasks (um por spec, ordem TDD):**
- `.spec/tasks/TASKS-000-core-wagering-domain.md` — domain models, repositories, use cases
- `.spec/tasks/TASKS-000.1-inbox-outbox-messaging.md` — inbox, outbox, SQS consumer, publisher
- `.spec/tasks/TASKS-000.2-api-http-endpoints.md` — controllers, DTOs, guards, filters
- `.spec/tasks/TASKS-000.3-concurrency-idempotency.md` — locking, idempotency, retry logic
- `.spec/tasks/TASKS-000.4-observability-health.md` — logging, metrics, health endpoints
- `.spec/tasks/TASKS-000.5-tests-concurrency.md` — unit tests, integration tests, concurrency tests
- `.spec/tasks/TASKS-000.6-auth-keycloak-oidc.md` — Docker setup, Auth module, guards, integration tests

**Agents:**
- `.agents/rules/constitution.md` — invariantes financeiros e de engenharia
- `.agents/rules/project-context.md` — stack: Bun, NestJS, TypeScript, MikroORM, PostgreSQL, SQS, Keycloak
- `.agents/rules/coding-standards.md` — TypeScript strict, DDD, imutabilidade, Decimal para dinheiro
- `.agents/rules/testing-standards.md` — TDD, test triad, testes de concorrência real

**Skills:**
- `.agents/skills/spec-driven-development/SKILL.md` — skill SDD
- `.agents/skills/spec-driven-development/templates/` — 5 templates adaptados (spec, plan, tasks, summary, architecture)
- `.agents/skills/ledger-engineering/SKILL.md` — engenharia de ledger financeiro
- `.agents/skills/outbox-messaging/SKILL.md` — mensageria com outbox pattern
- `.agents/skills/concurrency-safety/SKILL.md` — segurança de concorrência

**Workflows:**
- `.agents/workflows/sdd-feature.md` — workflow SDD adaptado para Bun/NestJS

**Summaries (estrutura vazia):**
- `.spec/summaries/SUMMARY-000-core-wagering-domain.md`
- `.spec/summaries/SUMMARY-000.1-inbox-outbox-messaging.md`
- `.spec/summaries/SUMMARY-000.2-api-http-endpoints.md`
- `.spec/summaries/SUMMARY-000.3-concurrency-idempotency.md`
- `.spec/summaries/SUMMARY-000.4-observability-health.md`
- `.spec/summaries/SUMMARY-000.5-tests-concurrency.md`
- `.spec/summaries/SUMMARY-000.6-auth-keycloak-oidc.md`

### ✓ Step 3: Criar SPEC-000.7 (MiniStack, documentação e manuais)
Revisão do Challenge.md revelou gaps críticos que exigem uma nova spec.

**Gaps identificados:**
1. **MiniStack SQS** — Não configurado no docker-compose; sem consumer SQS real; sem outbox publisher worker
2. **ARCHITECTURE.md** — Ausente no projeto raiz (exigido pela seção 14 do Challenge, 5 pontos)
3. **README.md** — Sem instruções de setup completo (docker-compose, env vars, comandos de teste)
4. **Manuais de execução** — Nenhum summary inclui instruções para exercitar as features implementadas
5. **Testes de concorrência real** — Supertest configurado mas testes pendentes por bugs de aplicação

**Arquivos a criar:**
- `.spec/SPEC-000.7-ministack-sqs-infrastructure.md` — MiniStack no docker-compose, SQS consumer, outbox publisher, retry e DLQ
- `.spec/plans/PLAN-000.7-ministack-sqs-infrastructure.md` — AWS SDK v3, filas FIFO, consumer com graceful shutdown
- `.spec/tasks/TASKS-000.7-ministack-sqs-infrastructure.md` — Tarefas TDD para SQS integration
- `.spec/summaries/SUMMARY-000.7-ministack-sqs-infrastructure.md` — estrutura vazia
- `ARCHITECTURE.md` — Decisões arquiteturais, trade-offs e limitações (seção 14 do Challenge)
- Atualizar `README.md` — Setup completo com docker-compose, env vars, scripts de teste
- Atualizar todos os 7 summaries existentes com seção "Manual de Execução"
- Atualizar `.spec/README.md` e `.spec/ROADMAP.md` com SPEC-000.7