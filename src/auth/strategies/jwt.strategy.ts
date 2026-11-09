import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { createPublicKey } from 'crypto';
import { execSync } from 'child_process';

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

interface JwksKey {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

/**
 * JWKs cache that works with Bun on Alpine Linux.
 *
 * Bun on Alpine does not support fetch(), https.get(), or http.get() for network
 * requests in a synchronous context. The jwks-rsa library hangs because it uses
 * https.get internally. This implementation uses execSync + wget (available in
 * Alpine) to fetch JWKs synchronously at startup, then serves cached PEM keys
 * during request processing.
 */
class JwksCache {
  private keys: Map<string, string> = new Map();
  private lastFetch: number = 0;
  private readonly logger = new Logger(JwksCache.name);

  constructor(
    private readonly jwksUri: string,
    private readonly cacheTtlMs: number,
  ) {
    // Pre-load keys synchronously at startup
    this.loadKeys();
  }

  /**
   * Synchronous key lookup — no async calls during request processing.
   */
  getPublicKeyByKid(kid: string): string {
    const pem = this.keys.get(kid);
    if (!pem) {
      throw new Error(`No signing key found for kid: ${kid}`);
    }
    return pem;
  }

  /**
   * Load JWKs synchronously using wget (available in Alpine).
   */
  private loadKeys(): void {
    try {
      const now = Date.now();
      if (this.keys.size > 0 && now - this.lastFetch < this.cacheTtlMs) {
        return; // Still valid
      }

      this.logger.debug(`Fetching JWKs from ${this.jwksUri}`);
      const data = execSync(`wget -q -O- "${this.jwksUri}"`, { timeout: 10000 }).toString();
      const jwks = JSON.parse(data) as { keys: JwksKey[] };
      this.keys.clear();
      for (const key of jwks.keys) {
        if (key.kty === 'RSA' && key.kid && key.n && key.e) {
          const pubKey = createPublicKey({
            key: { kty: key.kty, n: key.n, e: key.e },
            format: 'jwk',
          });
          const pem = pubKey.export({ format: 'pem', type: 'spki' });
          this.keys.set(key.kid, pem);
        }
      }
      this.lastFetch = Date.now();
      this.logger.log(`Cached ${this.keys.size} JWKs from ${this.jwksUri}`);
    } catch (error) {
      this.logger.warn(`JWKs load error: ${(error as Error).message} — using cached keys`);
    }
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(private readonly config: ConfigService) {
    const issuer = config.get<string>('auth.issuer');
    const internalUrl = config.get<string>('auth.internalUrl');
    const jwksCacheTtl = config.get<number>('auth.jwksCacheTtl');

    // Use internal URL for fetching JWKs (Docker network), issuer for JWT validation
    const jwksUri = `${internalUrl}/auth/realms/jungle/protocol/openid-connect/certs`;
    const jwksCache = new JwksCache(
      jwksUri,
      (jwksCacheTtl || 3600) * 1000,
    );

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: (
        _request: any,
        rawJwtToken: string,
        done: (error?: Error | null, secret?: string) => void,
      ) => {
        try {
          // Decode the JWT header to get the kid
          const parts = rawJwtToken.split('.');
          if (parts.length !== 3) {
            done(new Error('Invalid JWT format'));
            return;
          }
          const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
          const pem = jwksCache.getPublicKeyByKid(header.kid);
          done(null, pem);
        } catch (error) {
          done(error as Error);
        }
      },
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
