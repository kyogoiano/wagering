# TASKS-000.6: Autenticação — Keycloak + OIDC

**Status:** Rascunho  
**Depende de:** TASKS-000.2-api-http-endpoints  
**Spec:** SPEC-000.6-auth-keycloak-oidc  
**Plan:** PLAN-000.6-auth-keycloak-oidc

---

## 1. Infraestrutura

- [ ] **T144:** Configurar Docker Compose com Keycloak
  - Criar serviço `keycloak` no docker-compose.yml
  - Criar serviço `keycloak-db` (PostgreSQL dedicado)
  - Configurar health checks para ambos os serviços
  - Mapear porta 8080 para Keycloak admin console
  - Verificar: `docker compose up` sobe Keycloak sem erro

- [ ] **T145:** Criar realm export do Keycloak
  - Criar `keycloak/realm-export.json` com realm `jungle`
  - Configurar client `jungle-api` com client-secret
  - Definir roles: `jungle-admin`, `jungle-operator`, `jungle-reader`
  - Habilitar Authorization Code e Client Credentials grants
  - Verificar: realm é importado automaticamente no startup

- [ ] **T146:** Configurar variáveis de ambiente OIDC
  - Criar `.env` com `KEYCLOAK_ISSUER`, `KEYCLOAK_CLIENT_ID`, `KEYCLOAK_CLIENT_SECRET`
  - Criar `auth.config.ts` com `registerAs` do NestJS Config
  - Validar variáveis obrigatórias no bootstrap
  - Verificar: aplicação inicia com configuração OIDC válida

---

## 2. Auth Module

- [ ] **T147:** Criar Auth Module
  - Criar `auth.module.ts` com imports (Passport, JWT)
  - Registrar guards globais (JwtAuthGuard, RolesGuard)
  - Exportar módulo para uso em outros módulos
  - Verificar: módulo é importado no AppModule

- [ ] **T148:** Implementar JWT Strategy
  - Criar `jwt.strategy.ts` estendendo PassportStrategy
  - Configurar `secretOrKeyProvider` para fetch JWKs do Keycloak
  - Implementar cache de JWKs com TTL configurável
  - Implementar `validate()` para extrair user e roles
  - Verificar: token válido é decodificado corretamente
  - Usar `test.each` para validar diferentes payloads de token

- [ ] **T149:** Implementar JwtAuthGuard
  - Criar `jwt-auth.guard.ts` estendendo AuthGuard('jwt')
  - Respeitar decorator `@Public()` para endpoints abertos
  - Retornar 401 para requests sem token
  - Retornar 401 para tokens inválidos
  - Verificar: guard bloqueia requests sem token
  - Usar `test.each` para casos de token inválido (expirado, issuer errado, audience errada)

- [ ] **T150:** Implementar RolesGuard
  - Criar `roles.guard.ts` implementando CanActivate
  - Ler roles do decorator `@Roles()`
  - Comparar roles do token com roles requeridas
  - Retornar 403 para roles insuficientes
  - Verificar: guard permite acesso com role correta
  - Usar `test.each` para combinações de roles

- [ ] **T151:** Criar decorators
  - Criar `@Roles()` decorator com SetMetadata
  - Criar `@Public()` decorator com SetMetadata
  - Verificar: decorators são lidos pelos guards

---

## 3. Integração com Controllers

- [ ] **T152:** Aplicar guards nos controllers existentes
  - Marcar endpoints de health como `@Public()`
  - Aplicar `@Roles()` nos endpoints de wallets
  - Aplicar `@Roles()` nos endpoints de transações
  - Aplicar `@Roles()` nos endpoints de reconciliação
  - Verificar: endpoints protegidos retornam 401 sem token

- [ ] **T153:** Configurar JWKs cache
  - Implementar cache de JWKs com TTL
  - Configurar TTL via variável de ambiente (`JWK_CACHE_TTL`)
  - Implementar fallback se Keycloak estiver indisponível
  - Verificar: tokens continuam válidos com Keycloak down

---

## 4. Testes

- [ ] **T154:** Testes unitários para Auth Module
  - Testar JWT Strategy com tokens válidos e inválidos
  - Testar JwtAuthGuard com e sem token
  - Testar RolesGuard com diferentes combinações de roles
  - Usar `test.each` para múltiplos casos de token
  - Usar `describe.each` para diferentes roles

- [ ] **T155:** Testes de integração com Keycloak
  - Subir Keycloak via Testcontainers
  - Testar fluxo completo de autenticação
  - Testar obtenção de token via Client Credentials
  - Testar validação de token nos endpoints
  - Verificar: token obtido do Keycloak é aceito pela API

- [ ] **T155.1:** Testes parametrizados para autenticação
  - Usar `test.each` para validar diferentes tipos de token inválido
  - Usar `test.each` para combinações de roles × endpoints
  - Usar `describe.each` para diferentes grant types

---

## 5. Documentação

- [ ] **T156:** Documentar fluxo de autenticação
  - Adicionar seção de autenticação no README
  - Documentar como obter token via Client Credentials
  - Documentar roles e permissões
  - Documentar configuração de variáveis de ambiente
