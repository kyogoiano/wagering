# SPEC-000.6: Autenticação — Keycloak + OIDC

**Status:** Rascunho  
**Autor:** Junie  
**Revisão:** 1  
**Depende de:** SPEC-000.2-api-http-endpoints (endpoints protegidos)  
**Dependente de:** nenhum

---

## 1. Visão Geral

Este documento especifica a autenticação e autorização do serviço **Jungle — Distributed Wagering Processor** usando **Keycloak** como Identity Provider (IdP) com protocolo **OIDC (OpenID Connect)**.

A autenticação protege os endpoints HTTP administrativos (wallets, transações, reconciliação) enquanto os endpoints de health e mensagens da fila SQS permanecem abertos, conforme definido no Challenge.md (seção 2).

### Decisão de Design

O Challenge.md indica que autenticação não vale pontos na avaliação, mas o time decidiu implementar com Keycloak para:

1. **Demonstrar integração real com IdP externo** — conforme solicitado ("integrar um Identity Provider externo, não escrever autenticação artesanal")
2. **OIDC completo** — Keycloak fornece discovery, token introspection, e refresh automático
3. **Docker Compose** — Keycloak sobe facilmente junto com PostgreSQL e MiniStack
4. **Produtividade futura** — o mesmo IdP pode ser reutilizado para painel administrativo

---

## 2. Requisitos

### REQ-001: Identity Provider — Keycloak

**Descrição:** O sistema usa Keycloak como IdP central para autenticação de usuários e clientes.

**Motivação:** Keycloak é o IdP mais comum no mercado brasileiro, suporta OIDC completo, e integra naturalmente com Docker Compose.

**Contrato:**

- **Imagem Docker:** `quay.io/keycloak/keycloak:25.0` (ou versão estável mais recente)
- **Modo de execução:** `start-dev` em desenvolvimento, `start` em produção
- **Realm:** `jungle` (realm dedicado para o challenge)
- **Client:** `jungle-api` (confidential client com client-secret)
- **Protocolo:** OIDC (OpenID Connect 1.0)
- **Grant types:** Authorization Code + Client Credentials
- **Token format:** JWT (JSON Web Token)
- **JWS algorithm:** RS256

**Configuração do Realm:**

```yaml
realm: jungle
clients:
  - id: jungle-api
    client-authenticator-type: client-secret
    standard-flow-enabled: true
    service-accounts-enabled: true
    public-client: false
    redirect-uris:
      - 'http://localhost:*'
    web-origins:
      - 'http://localhost:*'
    scopes:
      - openid
      - profile
      - roles
roles:
  realm:
    - jungle-admin
    - jungle-operator
    - jungle-reader
```

**Critérios de Aceitação:**

- [ ] Keycloak sobe via Docker Compose sem intervenção manual
- [ ] Realm `jungle` é criado automaticamente via script de inicialização
- [ ] Client `jungle-api` está configurado com client-secret
- [ ] Tokens JWT são emitidos com assinatura RS256
- [ ] Endpoints de discovery (`/.well-known/openid-configuration`) respondem corretamente

### REQ-002: Fluxo OIDC — Authorization Code

**Descrição:** Usuários humanos autenticam via fluxo Authorization Code do OIDC.

**Motivação:** Fluxo padrão para aplicações com backend confidencial, seguro contra token leakage.

**Contrato:**

```
┌──────────┐     ┌────────────┐     ┌──────────┐
│  Browser  │     │  Jungle    │     │ Keycloak │
│           │     │  API       │     │  (IdP)   │
└─────┬─────┘     └─────┬──────┘     └────┬─────┘
      │                 │                 │
      │  302 Login      │                 │
      │────────────────>|                 │
      │                 │  authorize      │
      │                 │────────────────>|
      │  login form     │                 │
      |<────────────────│                 │
      │                 │                 │
      │  callback+code  │                 │
      │────────────────>|                 │
      │                 │  token(code)    │
      │                 │────────────────>|
      │                 │  access_token   │
      │                 |<────────────────│
      │  set-cookie     │                 │
      |<────────────────│                 │
```

**Critérios de Aceitação:**

- [ ] Request sem token redireciona para Keycloak login
- [ ] Após login bem-sucedido, usuário recebe access token
- [ ] Access token é validado em cada request protegido
- [ ] Token expirado retorna 401 Unauthorized

### REQ-003: Fluxo OIDC — Client Credentials

**Descrição:** Serviços e scripts autenticam via Client Credentials Grant.

**Motivação:** Permite que scripts de reconciliação e monitoramento acessem a API sem interação humana.

**Contrato:**

```typescript
// Request
POST /realms/jungle/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=jungle-api
&client_secret=${KEYCLOAK_CLIENT_SECRET}

// Response
{
  "access_token": "eyJhbGci...",
  "expires_in": 300,
  "token_type": "Bearer"
}
```

**Critérios de Aceitação:**

- [ ] Client credentials grant está habilitado para `jungle-api`
- [ ] Token é emitido com scopes configurados
- [ ] Token expira após o tempo configurado (default 300s)

### REQ-004: Validação de Tokens JWT

**Descrição:** A API valida tokens JWT em cada request protegido usando verificação assíncrona (async).

**Motivação:** Verificação assíncrona evita chamadas síncronas ao Keycloak, melhorando performance e resiliência.

**Contrato:**

```typescript
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'openid-client';

@Injectable()
export class JwtAuthGuard {
  private readonly jwksUri: string;

  constructor(
    private readonly config: ConfigService,
  ) {
    // Discovery automático via .well-known
    this.jwksUri = `${this.config.get('KEYCLOAK_ISSUER')}/.well-known/openid-configuration`;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      // Verificação assíncrona — valida assinatura, expiração, issuer e audience
      const payload = await this.verifyAsync(token, {
        issuer: this.config.get('KEYCLOAK_ISSUER'),
        audience: this.config.get('KEYCLOAK_AUDIENCE'),
      });

      // Anexa claims ao request
      request['user'] = payload;
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid access token');
    }
  }
}
```

**Regras de Validação:**

1. **Assinatura** — valida contra JWKs do Keycloak (RS256)
2. **Expiração** — rejeita tokens expirados (`exp` claim)
3. **Issuer** — verifica `iss` claim corresponde ao issuer configurado
4. **Audience** — verifica `aud` claim inclui o client ID configurado
5. **JTI** — opcionalmente verifica `jti` para replay protection
6. **Cache de JWKs** — cache local com TTL para evitar chamadas repetidas

**Critérios de Aceitação:**

- [ ] Token válido com assinatura correta é aceito
- [ ] Token expirado é rejeitado com 401
- [ ] Token com issuer inválido é rejeitado
- [ ] Token com audience inválida é rejeitado
- [ ] JWKs são cacheados com TTL configurável
- [ ] Falha no Keycloak não derruba a API (tokens cacheados continuam válidos)

### REQ-005: Autorização Baseada em Roles

**Descrição:** Acesso aos endpoints é controlado por roles definidas no Keycloak.

**Motivação:** Diferentes usuários têm diferentes níveis de acesso (admin, operator, reader).

**Contrato:**

```typescript
// Roles definidas no realm jungle
export enum JungleRole {
  ADMIN = 'jungle-admin',
  OPERATOR = 'jungle-operator',
  READER = 'jungle-reader',
}

// Mapeamento de roles por endpoint
const ROLE_POLICY = {
  'GET /api/wallets': [JungleRole.ADMIN, JungleRole.OPERATOR, JungleRole.READER],
  'POST /api/wallets': [JungleRole.ADMIN],
  'GET /api/transactions': [JungleRole.ADMIN, JungleRole.OPERATOR, JungleRole.READER],
  'POST /api/reconciliation': [JungleRole.ADMIN, JungleRole.OPERATOR],
  'GET /api/health': [], // aberto
  'GET /api/ready': [], // aberto
};

// Guard de roles
@Injectable()
export class RolesGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.getRequiredRoles(context);
    const user = context.switchToHttp().getRequest()['user'];

    if (!requiredRoles.length) return true; // endpoint aberto

    const hasRole = requiredRoles.some((role) => user.realm_access.roles.includes(role));
    return hasRole;
  }
}
```

**Hierarquia de Roles:**

| Role | Wallets | Transações | Reconciliação | Admin |
|------|---------|------------|---------------|-------|
| `jungle-admin` | CRUD | CRUD | CRUD | Sim |
| `jungle-operator` | Read | Read | Executar | Não |
| `jungle-reader` | Read | Read | Não | Não |

**Critérios de Aceitação:**

- [ ] Usuário sem role é rejeitado com 403 Forbidden
- [ ] Role `jungle-admin` tem acesso completo
- [ ] Role `jungle-reader` tem acesso somente leitura
- [ ] Health endpoints são abertos sem autenticação

### REQ-006: Docker Compose — Keycloak Service

**Descrição:** Keycloak é configurado como serviço no Docker Compose, integrado com PostgreSQL.

**Motivação:** Permite subir o ambiente completo com um único comando (`docker compose up`).

**Contrato:**

```yaml
# docker-compose.yml (adendo)
services:
  keycloak:
    image: quay.io/keycloak/keycloak:25.0
    container_name: jungle-keycloak
    command: start-dev
    ports:
      - '8080:8080'
    environment:
      KEYCLOAK_ADMIN: admin
      KEYCLOAK_ADMIN_PASSWORD: admin
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://keycloak-db:5432/keycloak
      KC_DB_USERNAME: keycloak
      KC_DB_PASSWORD: keycloak_password
      KC_HTTP_RELATIVE_PATH: /auth
    volumes:
      - ./keycloak/realm-export.json:/opt/keycloak/data/import/realm-export.json:ro
    depends_on:
      keycloak-db:
        condition: service_healthy

  keycloak-db:
    image: postgres:16
    container_name: jungle-keycloak-db
    environment:
      POSTGRES_DB: keycloak
      POSTGRES_USER: keycloak
      POSTGRES_PASSWORD: keycloak_password
    ports:
      - '5433:5432'
    volumes:
      - keycloak_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U keycloak']
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  keycloak_data:
```

**Script de Importação do Realm:**

```json
// keycloak/realm-export.json
{
  "id": "jungle",
  "realm": "jungle",
  "enabled": true,
  "clients": [
    {
      "clientId": "jungle-api",
      "enabled": true,
      "publicClient": false,
      "standardFlowEnabled": true,
      "serviceAccountsEnabled": true,
      "secret": "${KEYCLOAK_CLIENT_SECRET}",
      "redirectUris": ["http://localhost:*"],
      "webOrigins": ["http://localhost:*"],
      "scopes": ["openid", "profile", "roles"]
    }
  ],
  "roles": {
    "realm": [
      { "name": "jungle-admin" },
      { "name": "jungle-operator" },
      { "name": "jungle-reader" }
    ]
  }
}
```

**Critérios de Aceitação:**

- [ ] Keycloak sobe com `docker compose up` sem erro
- [ ] Realm `jungle` é importado automaticamente
- [ ] Console admin acessível em `http://localhost:8080/auth/admin`
- [ ] Client `jungle-api` está configurado e funcional
- [ ] Banco de dados Keycloak é separado do banco da aplicação

### REQ-007: Configuração da Aplicação

**Descrição:** A aplicação configura o OIDC via variáveis de ambiente.

**Motivação:** Permite configurar o IdP sem rebuild da aplicação.

**Contrato:**

```typescript
// src/config/auth.config.ts
export const AuthConfig = {
  KEYCLOAK_ISSUER: process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/auth/realms/jungle',
  KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID || 'jungle-api',
  KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET,
  KEYCLOAK_AUDIENCE: process.env.KEYCLOAK_AUDIENCE || 'jungle-api',
  JWK_CACHE_TTL: parseInt(process.env.JWK_CACHE_TTL || '3600'), // segundos
};
```

**.env (desenvolvimento):**

```env
KEYCLOAK_ISSUER=http://localhost:8080/auth/realms/jungle
KEYCLOAK_CLIENT_ID=jungle-api
KEYCLOAK_CLIENT_SECRET=${KEYCLOAK_CLIENT_SECRET}
KEYCLOAK_AUDIENCE=jungle-api
JWK_CACHE_TTL=3600
```

**Critérios de Aceitação:**

- [ ] Aplicação inicia sem erro com configuração OIDC
- [ ] Variáveis de ambiente são validadas no bootstrap
- [ ] Erro de configuração OIDC impede startup com mensagem clara

### REQ-008: Endpoints Abertos vs Protegidos

**Descrição:** Define quais endpoints requerem autenticação e quais são abertos.

**Motivação:** Health checks e mensagens SQS não devem ser bloqueados pela autenticação.

**Contrato:**

| Endpoint | Autenticação | Roles |
|----------|-------------|-------|
| `GET /health` | Não | — |
| `GET /ready` | Não | — |
| `GET /api/wallets` | Sim | admin, operator, reader |
| `POST /api/wallets` | Sim | admin |
| `GET /api/transactions` | Sim | admin, operator, reader |
| `POST /api/reconciliation` | Sim | admin, operator |
| `SQS Consumer` | Não | — (canal interno) |

**Critérios de Aceitação:**

- [ ] Health endpoints respondem sem token
- [ ] Endpoints de API retornam 401 sem token
- [ ] Endpoints de API retornam 403 com role inadequada
- [ ] SQS consumer processa mensagens sem autenticação

---

## 3. Regras de Negócio

### RN-001: Sem autenticação artesanal

**Regra:** Não implementar tabela própria de usuários com hash de senha.

**Motivação:** O IdP externo é responsável por gestão de identidade. A aplicação consome tokens, não gerencia credenciais.

### RN-002: Mensagens SQS são canal interno confiável

**Regra:** Mensagens vindas da fila SQS não passam por autenticação OIDC.

**Motivação:** A fila é canal interno entre provedores e o processador. A identidade do provedor contida na mensagem continua sujeita às mesmas validações de domínio.

### RN-003: Token validation failure não derruba serviço

**Regra:** Se o Keycloak estiver indisponível, tokens já cacheados continuam sendo validados.

**Motivação:** Resiliência — falha no IdP não deve derrubar o serviço financeiro.

---

## 4. Não-Funcional

### NFR-001: Performance de Validação

- Validação de token com JWKs cacheados: **< 5ms**
- Cache de JWKs com TTL configurável (default 3600s)

### NFR-002: Segurança

- Tokens JWT assinados com RS256
- Client secret armazenado em variável de ambiente
- HTTPS em produção (HTTP apenas em desenvolvimento)

### NFR-003: Resiliência

- Keycloak indisponível não derruba a API
- Tokens cacheados continuam válidos até expirar
- Health checks funcionam sem Keycloak

---

## 5. Riscos e Mitigações

| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Keycloak lento na inicialização | API não sobe | Health check com retry no Keycloak |
| JWKs expiram durante pico | Tokens rejeitados | Cache com TTL + fallback |
| Client secret exposto | Segurança comprometida | Variável de ambiente + .env gitignored |
| Realm import falha | Autenticação quebrada | Script de import com validação |

---

## 6. Glossário

| Termo | Definição |
|-------|-----------|
| **IdP** | Identity Provider — serviço que autentica usuários e emite tokens |
| **OIDC** | OpenID Connect — protocolo de autenticação baseado em OAuth 2.0 |
| **JWT** | JSON Web Token — formato de token assinado |
| **JWKs** | JSON Web Keys — chaves públicas para validar JWTs |
| **RS256** | Algoritmo de assinatura RSA com SHA-256 |
| **Realm** | Isolamento de tenants no Keycloak |
| **Client** | Aplicação registrada no Keycloak |
| **Grant Type** | Fluxo de autenticação (Authorization Code, Client Credentials) |
