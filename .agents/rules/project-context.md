# Project Context — Jungle Distributed Wagering Processor

## Stack Tecnológico

| Componente | Escolha | Versão |
|-----------|---------|--------|
| Runtime | Bun | 1.x |
| Linguagem | TypeScript | strict mode |
| Framework | NestJS | latest |
| Banco | PostgreSQL | 16 |
| ORM | MikroORM | latest |
| Mensageria | AWS SQS via MiniStack | latest |
| Autenticação | Keycloak (OIDC) | 25.0 |
| Orquestração | Docker Compose | latest |
| Decimal | decimal.js-light | latest |
| Logger | Pino | latest |
| Métricas | Prometheus | latest |

## Domínio

O sistema processa transações de apostas (BET, WIN, LOSS, REFUND, ROLLBACK) recebidas de múltiplos provedores de jogos. Cada operação afeta o saldo de uma wallet e gera lançamentos auditáveis no ledger.

## Restrições Invioláveis

- Não usar `number`, `float` ou `double` para dinheiro
- Não usar cache em memória como garantia de idempotência
- Não confiar apenas em SQS FIFO para garantir consistência
- Não publicar eventos antes do commit da transação financeira
- Não sobrescrever nem excluir lançamentos do ledger
- Não usar lock global compartilhado por todas as wallets
- Não implementar saldo como read → calculate → update sem controle de concorrência

## Ambiente de Desenvolvimento

- Docker Compose para PostgreSQL, MiniStack e Keycloak
- Keycloak com realm `jungle` e client `jungle-api`
- Migrations versionadas e reversíveis
- Testes com containers reais

## Autenticação

- **IdP:** Keycloak via OIDC (OpenID Connect)
- **Protocolo:** JWT com assinatura RS256
- **Fluxos:** Authorization Code (usuários) + Client Credentials (serviços)
- **Roles:** `jungle-admin`, `jungle-operator`, `jungle-reader`
- **Endpoints abertos:** health checks e SQS consumer
- **Validação:** JWKs cacheados com TTL configurável

## Referências

- [Challenge.md](../../Challenge.md) — documento original
- [Constitution](./constitution.md) — invariantes
- [ARCH-000](../../.spec/architecture/ARCH-000-distributed-wagering-processor.md) — arquitetura
