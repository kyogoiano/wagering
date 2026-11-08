# Jungle — Distributed Wagering Processor

## Índice Mestre

Projeto **Jungle** é um serviço financeiro distribuído que processa transações de apostas recebidas de múltiplos provedores de jogos, garantindo correção financeira, idempotência persistente, e consistência entre saldo materializado e ledger auditável.

### Stack Tecnológico

| Componente       | Escolha                                      |
|------------------|----------------------------------------------|
| Runtime          | Bun 1.x                                      |
| Linguagem        | TypeScript (strict mode)                     |
| Framework        | NestJS                                       |
| Banco de Dados   | PostgreSQL                                   |
| ORM              | MikroORM (Unit of Work, Identity Map, LockMode) |
| Mensageria       | AWS SQS via MiniStack                        |
| Autenticação     | Keycloak (OIDC)                              |
| Orquestração     | Docker Compose                               |
| Migrations       | Versionadas e reversíveis                    |

### Taxonomia de Documentos

#### Especificações (`.spec/SPEC-*.md`)

Descrevem **o que** será construído, com requisitos, invariantes, contratos e critérios de aceitação.

| Spec | Nome | Descrição |
|------|------|-----------|
| [SPEC-000](./SPEC-000-core-wagering-domain.md) | Core Wagering Domain | Domínio central: Money, Wallet, WagerTransaction, Ledger, FailureCodes |
| [SPEC-000.1](./SPEC-000.1-inbox-outbox-messaging.md) | Inbox & Outbox Messaging | Inbox persistente, outbox, consumidor SQS, worker outbox, retry e DLQ |
| [SPEC-000.2](./SPEC-000.2-api-http-endpoints.md) | API HTTP Endpoints | Endpoints HTTP: wallets, transactions, reconciliation, health |
| [SPEC-000.3](./SPEC-000.3-concurrency-idempotency.md) | Concurrency & Idempotency | Estratégia de lock por wallet, idempotência persistente, replay |
| [SPEC-000.4](./SPEC-000.4-observability-health.md) | Observability & Health | Logs estruturados JSON, métricas, health checks live/ready |
| [SPEC-000.5](./SPEC-000.5-tests-concurrency.md) | Tests & Concurrency | Testes de unidade, integração com containers, testes de concorrência real |
| [SPEC-000.6](./SPEC-000.6-auth-keycloak-oidc.md) | Auth — Keycloak + OIDC | Autenticação via Keycloak, OIDC flows, JWT validation, roles-based authorization |
| [SPEC-000.7](./SPEC-000.7-ministack-sqs-infrastructure.md) | MiniStack SQS & Documentation | MiniStack no docker-compose, SQS consumer, outbox publisher, ARCHITECTURE.md, README.md, manuais de execução |

#### Arquitetura (`.spec/architecture/ARCH-*.md`)

Documentos de arquitetura profunda com diagramas, decisões, trade-offs e justificativas.

| Doc | Nome | Descrição |
|-----|------|-----------|
| [ARCH-000](./architecture/ARCH-000-distributed-wagering-processor.md) | Distributed Wagering Processor | Topologia macro, componentes, fluxo de dados, estratégia de concorrência, schema PostgreSQL, invariantes |

#### Planos (`.spec/plans/PLAN-*.md`)

Planos de implementação por fase, com módulos NestJS, entities MikroORM, DDL, factories e services.

| Plan | Nome | Descrição |
|------|------|-----------|
| [PLAN-000](./plans/PLAN-000-core-wagering-domain.md) | Core Wagering Domain | Módulos, entities, DDL, factories, services do domínio |
| [PLAN-000.1](./plans/PLAN-000.1-inbox-outbox-messaging.md) | Inbox & Outbox Messaging | Inbox/outbox pattern, SQS consumer, publisher, retry |
| [PLAN-000.2](./plans/PLAN-000.2-api-http-endpoints.md) | API HTTP Endpoints | Controllers, DTOs, guards, exception filters |
| [PLAN-000.3](./plans/PLAN-000.3-concurrency-idempotency.md) | Concurrency & Idempotency | Lock pessimistic, idempotencyKey, payload hash |
| [PLAN-000.4](./plans/PLAN-000.4-observability-health.md) | Observability & Health | Pino logger, Prometheus metrics, health indicators |
| [PLAN-000.5](./plans/PLAN-000.5-tests-concurrency.md) | Tests & Concurrency | Testes unitários, integração, race conditions |
| [PLAN-000.6](./plans/PLAN-000.6-auth-keycloak-oidc.md) | Auth — Keycloak + OIDC | Auth module, JWT strategy, guards, Docker Compose, realm config |
| [PLAN-000.7](./plans/PLAN-000.7-ministack-sqs-infrastructure.md) | MiniStack SQS & Documentation | AWS SDK v3, filas FIFO, consumer com graceful shutdown, outbox publisher |

#### Tarefas (`.spec/tasks/TASKS-*.md`)

Breakdown de tarefas em ordem TDD (Test-Driven Development).

| Tasks | Nome | Descrição |
|-------|------|-----------|
| [TASKS-000](./tasks/TASKS-000-core-wagering-domain.md) | Core Wagering Domain | Domain models, repositories, use cases |
| [TASKS-000.1](./tasks/TASKS-000.1-inbox-outbox-messaging.md) | Inbox & Outbox Messaging | Inbox, outbox, SQS consumer, publisher |
| [TASKS-000.2](./tasks/TASKS-000.2-api-http-endpoints.md) | API HTTP Endpoints | Controllers, DTOs, guards, filters |
| [TASKS-000.3](./tasks/TASKS-000.3-concurrency-idempotency.md) | Concurrency & Idempotency | Locking, idempotency, retry logic |
| [TASKS-000.4](./tasks/TASKS-000.4-observability-health.md) | Observability & Health | Logging, metrics, health endpoints |
| [TASKS-000.5](./tasks/TASKS-000.5-tests-concurrency.md) | Tests & Concurrency | Unit tests, integration tests, concurrency tests |
| [TASKS-000.6](./tasks/TASKS-000.6-auth-keycloak-oidc.md) | Auth — Keycloak + OIDC | Docker setup, Auth module, guards, integration tests |
| [TASKS-000.7](./tasks/TASKS-000.7-ministack-sqs-infrastructure.md) | MiniStack SQS & Documentation | SQS integration, documentation, execution manuals |

#### Sumários (`.spec/summaries/SUMMARY-*.md`)

Preenchidos **após** a implementação de cada fase, documentando o que foi construído, decisões tomadas e lições aprendidas.

| Summary | Status |
|---------|--------|
| [SUMMARY-000](./summaries/SUMMARY-000-core-wagering-domain.md) | ✓ Concluído |
| [SUMMARY-000.1](./summaries/SUMMARY-000.1-inbox-outbox-messaging.md) | ✓ Concluído |
| [SUMMARY-000.2](./summaries/SUMMARY-000.2-api-http-endpoints.md) | ✓ Concluído |
| [SUMMARY-000.3](./summaries/SUMMARY-000.3-concurrency-idempotency.md) | ✓ Concluído |
| [SUMMARY-000.4](./summaries/SUMMARY-000.4-observability-health.md) | ✓ Concluído |
| [SUMMARY-000.5](./summaries/SUMMARY-000.5-tests-concurrency.md) | ⏳ Parcial |
| [SUMMARY-000.6](./summaries/SUMMARY-000.6-auth-keycloak-oidc.md) | ✓ Concluído |
| [SUMMARY-000.7](./summaries/SUMMARY-000.7-ministack-sqs-infrastructure.md) | ⏳ Pendente |

### Regras do Projeto (`.agents/rules/`)

| Regra | Descrição |
|-------|-----------|
| [constitution.md](../agents/rules/constitution.md) | Invariantes financeiros e de engenharia |
| [project-context.md](../agents/rules/project-context.md) | Stack, domínio, restrições |
| [coding-standards.md](../agents/rules/coding-standards.md) | Padrões TypeScript strict, DDD, imutabilidade |
| [testing-standards.md](../agents/rules/testing-standards.md) | TDD, test triad, testes de concorrência |

### Skills (`.agents/skills/`)

| Skill | Descrição |
|-------|-----------|
| [spec-driven-development](../agents/skills/spec-driven-development/) | Templates e workflow SDD |
| [ledger-engineering](../agents/skills/ledger-engineering/) | Engenharia de ledger financeiro |
| [outbox-messaging](../agents/skills/outbox-messaging/) | Mensageria com outbox pattern |
| [concurrency-safety](../agents/skills/concurrency-safety/) | Segurança de concorrência |

### Workflows (`.agents/workflows/`)

| Workflow | Descrição |
|----------|-----------|
| [sdd-feature.md](../agents/workflows/sdd-feature.md) | Workflow SDD adaptado para Bun/NestJS |
