# Workflow: SDD Feature

## Fluxo Spec-Driven Development para Bun/NestJS

### 1. Planejar

1. Ler a spec em `.spec/SPEC-*.md`
2. Consultar o plan em `.spec/plans/PLAN-*.md`
3. Consultar as tasks em `.spec/tasks/TASKS-*.md`
4. Verificar a constitution em `.agents/rules/constitution.md`

### 2. Implementar (TDD)

Para cada task:

1. **Red** — Escrever o teste que falha
2. **Green** — Implementar o código mínimo para passar
3. **Refactor** — Melhorar o código mantendo os testes passando

### 3. Validar

1. Executar testes de unidade: `bun test`
2. Executar testes de integração: `bun test:integration`
3. Executar testes de concorrência: `bun test:concurrency`
4. Verificar invariante: `wallet.balance == saldo reconstruído pelo ledger`

### 4. Documentar

1. Preencher o summary em `.spec/summaries/SUMMARY-*.md`
2. Atualizar o README do projeto com novos endpoints ou comandos
3. Atualizar o ARCHITECTURE.md com decisões tomadas

### 5. Entregar

1. Garantir que todos os testes passam
2. Garantir que a invariante final é satisfeita
3. Submeter a solução

## Comandos

```bash
# Testes de unidade
bun test

# Testes de integração (com Docker)
docker compose -f docker-compose.test.yml up -d
bun test:integration

# Testes de concorrência
bun test:concurrency

# Aplicar migrations
bun run migration:up

# Iniciar aplicação
bun run start:dev
```

## Referências

- [Constitution](../.agents/rules/constitution.md)
- [Coding Standards](../.agents/rules/coding-standards.md)
- [Testing Standards](../.agents/rules/testing-standards.md)
