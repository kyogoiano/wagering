# Skill: Spec-Driven Development

## Descrição

Skill para desenvolvimento orientado a especificações (SDD) no projeto Jungle, adaptado para Bun/NestJS.

## Workflow

1. **Spec** — Ler a spec relevante em `.spec/SPEC-*.md`
2. **Plan** — Consultar o plan em `.spec/plans/PLAN-*.md`
3. **Tasks** — Executar tarefas em ordem TDD em `.spec/tasks/TASKS-*.md`
4. **Implement** — Implementar código seguindo coding standards
5. **Summary** — Preencher `.spec/summaries/SUMMARY-*.md` após conclusão

## Templates

Templates disponíveis em `templates/`:

- `spec-template.md` — para novas especificações
- `plan-template.md` — para planos de implementação
- `tasks-template.md` — para breakdown de tarefas
- `summary-template.md` — para sumários pós-implementação
- `architecture-template.md` — para documentos de arquitetura

## Regras

- Sempre ler a spec antes de implementar
- Seguir a ordem TDD das tasks
- Preencher o summary após cada fase
- Consultar a constitution para invariantes
