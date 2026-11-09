# --- Stage 1: Build ---
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source code
COPY tsconfig.json ./
COPY src/ ./src/

# Build step — Bun can run TypeScript directly, but we pre-bundle for production
RUN bun build src/main.ts --target=bun --outdir=./dist --external @mikro-orm/* --external @nestjs/* --external @aws-sdk/* --external reflect-metadata --external rxjs --external decimal.js --external pino --external pino-pretty --external class-transformer --external class-validator --external jwks-rsa --external passport --external passport-jwt --external @prometheus-io/client

# --- Stage 2: Production ---
FROM oven/bun:1-alpine AS production

# Install curl for health checks
RUN apk add --no-cache curl

WORKDIR /app

# Copy package files and install production dependencies
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy migrations for runtime execution
COPY src/infrastructure/persistence/migrations ./src/infrastructure/persistence/migrations

# Copy source for runtime (Bun needs .ts files for decorators/reflection)
COPY src/ ./src/
COPY tsconfig.json ./

# Non-root user
RUN addgroup -g 1001 -S appgroup && adduser -S appuser -u 1001 -G appgroup
USER appuser

EXPOSE 3000
ENV NODE_ENV=production

CMD ["bun", "run", "src/main.ts"]
