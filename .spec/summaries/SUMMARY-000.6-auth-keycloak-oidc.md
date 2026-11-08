# SUMMARY-000.6: Autenticação — Keycloak + OIDC

**Status:** Concluído  
**Spec:** SPEC-000.6-auth-keycloak-oidc  
**Plan:** PLAN-000.6-auth-keycloak-oidc  
**Tasks:** TASKS-000.6-auth-keycloak-oidc

---

## Resumo

Implementada a camada de autenticação e autorização completa usando Keycloak como IdP com protocolo OIDC. A API valida tokens JWT assíncronamente via JWKs cacheados, com guards globais de autenticação (JwtAuthGuard) e autorização por roles (RolesGuard). Endpoints de health marcados como públicos, todos os outros protegidos com roles baseadas no Challenge.md.

---

## Implementação

### Auth Module
- **AuthModule** (`src/auth/auth.module.ts`) — módulo @Global com PassportModule, guards globais (JwtAuthGuard + RolesGuard), e ConfigModule.forFeature para auth config
- **AuthConfig** (`src/auth/auth.config.ts`) — registerAs('auth') com 5 variáveis: issuer, clientId, clientSecret, audience, jwksCacheTtl
- **JwtStrategy** (`src/auth/strategies/jwt.strategy.ts`) — PassportStrategy com jwks-rsa expressJwtSecret para JWKs cacheados com TTL configurável; validate() extrai userId, roles e email do payload

### Guards & Decorators
- **JwtAuthGuard** (`src/auth/guards/jwt-auth.guard.ts`) — estende AuthGuard('jwt'), respeita @Public() via Reflector
- **RolesGuard** (`src/auth/guards/roles.guard.ts`) — implementa CanActivate, lê @Roles() metadata, compara com user.roles do token
- **@Roles()** (`src/auth/decorators/roles.decorator.ts`) — SetMetadata com JungleRole enum (ADMIN, OPERATOR, READER)
- **@Public()** (`src/auth/decorators/public.decorator.ts`) — SetMetadata('isPublic', true)

### Integração com Controllers
- **HealthController** — @Public() no controller (live e ready abertos)
- **WalletsController** — POST @Roles(ADMIN), GET @Roles(ADMIN, OPERATOR, READER)
- **WageringController** — POST @Roles(ADMIN, OPERATOR), GET @Roles(ADMIN, OPERATOR, READER)
- **ReconciliationController** — POST @Roles(ADMIN, OPERATOR)

### Infraestrutura
- **docker-compose.yml** — serviços keycloak (quay.io/keycloak/keycloak:26.8) e keycloak-db (postgres:16) com health checks
- **keycloak/realm-export.json** — realm jungle, client jungle-api, 3 roles, service account, protocol mapper para realm_access.roles
- **.env.example** — template com todas as variáveis de ambiente

### Decisões
- Usado `jwks-rsa.expressJwtSecret()` em vez de `jwksToExpress()` (API correta da biblioteca)
- Guards globais via APP_GUARD no AuthModule @Global — sem necessidade de registrar em cada controller
- ConfigModule.forRoot({ isGlobal: true }) no AppModule para ConfigService disponível globalmente

---

## Testes

- `bun test src/` — **247 testes passando, 0 falhas, 434 assertions**
- **Auth tests (31 novos):**
  - RolesGuard: 15 testes (6 parametrizados com it.each para permissões, 5 para rejeições, 4 edge cases)
  - JwtAuthGuard: 4 testes (public endpoints, non-public delegation, reflector metadata)
  - Decorators: 7 testes (Roles single/multiple, JungleRole enum values, Public on function/class)
  - AuthConfig: 5 testes (custom env vars para issuer, clientId, audience, jwksCacheTtl, clientSecret)

---

## Artefatos

### Arquivos criados (13)
- `src/auth/auth.module.ts`
- `src/auth/auth.config.ts`
- `src/auth/auth.config.spec.ts`
- `src/auth/guards/jwt-auth.guard.ts`
- `src/auth/guards/jwt-auth.guard.spec.ts`
- `src/auth/guards/roles.guard.ts`
- `src/auth/guards/roles.guard.spec.ts`
- `src/auth/decorators/roles.decorator.ts`
- `src/auth/decorators/public.decorator.ts`
- `src/auth/decorators/decorators.spec.ts`
- `src/auth/strategies/jwt.strategy.ts`
- `docker-compose.yml`
- `keycloak/realm-export.json`
- `.env.example`

### Arquivos modificados (7)
- `src/app/app.module.ts` — adicionado ConfigModule.forRoot() e AuthModule
- `src/api/health/health.controller.ts` — @Public()
- `src/api/wallets/wallets.controller.ts` — @Roles() em cada endpoint
- `src/api/wagering/wagering.controller.ts` — @Roles() em cada endpoint
- `src/api/reconciliation/reconciliation.controller.ts` — @Roles()
- `tsconfig.json` — path alias @auth/*
- `src/application/idempotency/idempotency.service.spec.ts` — correção de import path

### Dependências adicionadas
- @nestjs/passport@12.0.1, passport@0.7.0, passport-jwt@4.0.1, @nestjs/jwt@12.0.4, jwks-rsa@4.1.0, @nestjs/config@12.1.1
- @types/passport-jwt@4.0.1, @types/passport@1.0.17

---

## Lições Aprendidas

- **jwks-rsa API:** `jwksToExpress()` não existe na v4; usar `expressJwtSecret()` diretamente
- **Bun test mocks:** usar `mock()` do Bun, não `jest.fn()` — a API é diferente
- **ConfigModule:** precisa de `forRoot({ isGlobal: true })` no AppModule para registerAs funcionar em módulos filhos
- **AuthGuard unit tests:** quando não public, AuthGuard('jwt').canActivate() chama o passport que precisa de getResponse() no mock context
