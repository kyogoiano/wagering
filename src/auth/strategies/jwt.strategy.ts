import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import jwksRsa from 'jwks-rsa';

export interface JwtPayload {
  sub: string;
  email?: string;
  realm_access?: {
    roles: string[];
  };
  resource_access?: Record<string, { roles: string[] }>;
  exp: number;
  iat: number;
  iss: string;
  aud: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly config: ConfigService) {
    const issuer = config.get<string>('auth.issuer');
    const audience = config.get<string>('auth.audience');
    const jwksCacheTtl = config.get<number>('auth.jwksCacheTtl');

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: jwksRsa.expressJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        cacheMaxEntries: 5,
        cacheMaxAge: (jwksCacheTtl || 3600) * 1000,
        jwksUri: `${issuer}/protocol/openid-connect/certs`,
      }),
      audience,
      issuer: `${issuer}`,
    });
  }

  async validate(payload: JwtPayload) {
    const roles = payload.realm_access?.roles || [];
    this.logger.debug(`Authenticated user: ${payload.sub} with roles: ${roles.join(', ')}`);

    return {
      userId: payload.sub,
      roles,
      email: payload.email,
    };
  }
}
