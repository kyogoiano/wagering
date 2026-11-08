# PLAN-000.6: Autenticação — Keycloak + OIDC

**Status:** Rascunho  
**Depende de:** PLAN-000.2-api-http-endpoints  
**Spec:** SPEC-000.6-auth-keycloak-oidc

---

## 1. Módulos NestJS

### Auth Module

```
src/
├── auth/
│   ├── auth.module.ts           # Módulo principal
│   ├── auth.config.ts           # Configuração OIDC via ConfigService
│   ├── guards/
│   │   ├── jwt-auth.guard.ts    # Guard de autenticação JWT
│   │   └── roles.guard.ts       # Guard de autorização por roles
│   ├── decorators/
│   │   ├── roles.decorator.ts   # @Roles() decorator
│   │   └── public.decorator.ts  # @Public() decorator para endpoints abertos
│   ├── strategies/
│   │   └── jwt.strategy.ts      # Passport strategy para JWT
│   └── dto/
│       └── token-response.dto.ts
```

### Auth Module Registration

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET'),
        signOptions: {
          expiresIn: config.get('JWT_EXPIRATION'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    JwtStrategy,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
  exports: [JwtModule, PassportModule],
})
export class AuthModule {}
```

---

## 2. Configuração OIDC

### Auth Config Service

```typescript
// src/auth/auth.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  issuer: process.env.KEYCLOAK_ISSUER || 'http://localhost:8080/auth/realms/jungle',
  clientId: process.env.KEYCLOAK_CLIENT_ID || 'jungle-api',
  clientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
  audience: process.env.KEYCLOAK_AUDIENCE || 'jungle-api',
  jwksCacheTtl: parseInt(process.env.JWK_CACHE_TTL || '3600', 10),
}));
```

### JWT Strategy

```typescript
// src/auth/strategies/jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: async (req, jwtToken, done) => {
        // Fetch JWKs from Keycloak's .well-known endpoint
        // Cache JWKs with TTL
        const publicKey = await this.getPublicKeyFromJwks(jwtToken);
        done(null, publicKey);
      },
    });
  }

  async validate(payload: any) {
    return {
      userId: payload.sub,
      roles: payload.realm_access?.roles || [],
      email: payload.email,
    };
  }
}
```

---

## 3. Guards

### JWT Auth Guard

```typescript
// src/auth/guards/jwt-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
}
```

### Roles Guard

```typescript
// src/auth/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

export enum JungleRole {
  ADMIN = 'jungle-admin',
  OPERATOR = 'jungle-operator',
  READER = 'jungle-reader',
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<JungleRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true; // No roles required
    }

    const { user } = context.switchToHttp().getRequest();
    const hasRole = requiredRoles.some((role) => user.roles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
```

### Decorators

```typescript
// src/auth/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';
import { JungleRole } from '../guards/roles.guard';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: JungleRole[]) => SetMetadata(ROLES_KEY, roles);

// src/auth/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

---

## 4. Docker Compose

### Keycloak Service

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
    healthcheck:
      test: ['CMD-SHELL', 'curl -f http://localhost:8080/auth/realms/master || exit 1']
      interval: 10s
      timeout: 5s
      retries: 10

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

### Realm Export

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
      "secret": "change-me-in-production",
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

---

## 5. Uso nos Controllers

```typescript
// Exemplo de uso nos controllers existentes

@Controller('wallets')
export class WalletsController {
  @Get()
  @Roles(JungleRole.ADMIN, JungleRole.OPERATOR, JungleRole.READER)
  findAll() { /* ... */ }

  @Post()
  @Roles(JungleRole.ADMIN)
  create(@Body() createWalletDto: CreateWalletDto) { /* ... */ }
}

@Controller('health')
@Public() // Todo o controller é público
export class HealthController {
  @Get()
  check() { /* ... */ }
}
```

---

## 6. Dependências

```json
{
  "dependencies": {
    "@nestjs/passport": "^10.0.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.0",
    "@nestjs/jwt": "^10.0.0",
    "jwks-rsa": "^3.0.0"
  }
}
```

---

## 7. Ordem de Implementação

1. **Configuração** — Auth config service e variáveis de ambiente
2. **Docker Compose** — Keycloak service e realm export
3. **JWT Strategy** — Passport strategy com JWKs cache
4. **Guards** — JwtAuthGuard e RolesGuard
5. **Decorators** — @Roles() e @Public()
6. **Auth Module** — Registro e export
7. **Integração** — Aplicar guards nos controllers existentes
8. **Testes** — Testes unitários e de integração
