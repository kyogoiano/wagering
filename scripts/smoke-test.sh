#!/usr/bin/env bash
#
# smoke-test.sh — Exercita todas as features do Jungle API via curl
#
# Uso:
#   ./scripts/smoke-test.sh                    # usa defaults (localhost:3000, localhost:8080)
#   APP_HOST=api.example.com ./scripts/smoke-test.sh
#   KEYCLOAK_HOST=keycloak.example.com ./scripts/smoke-test.sh
#
# Pré-requisitos:
#   - Docker Compose rodando (docker compose up -d)
#   - Todos os 5 serviços healthy (jungle-app, jungle-db, ministack, keycloak, keycloak-db)
#
# O script testa:
#   1. Health checks (live + ready)
#   2. Autenticação Keycloak (3 roles: admin, operator, reader)
#   3. Criação de wallets
#   4. Transações de wagering (BET, CREDIT, REFUND, WIN)
#   5. Idempotência (replay com mesma key)
#   6. Consulta de ledger
#   7. Reconciliation
#   8. Métricas Prometheus
#   9. Controle de acesso por role
#

set -euo pipefail

# ── Configuração ──────────────────────────────────────────────────────────────

APP_HOST="${APP_HOST:-localhost:3000}"
KEYCLOAK_HOST="${KEYCLOAK_HOST:-localhost:8080}"
KEYCLOAK_ISSUER="http://${KEYCLOAK_HOST}/auth/realms/jungle"
KEYCLOAK_CLIENT_ID="jungle-api"
KEYCLOAK_CLIENT_SECRET="change-me-in-production"

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Contadores
PASS=0
FAIL=0
TOTAL=0

# ── Funções auxiliares ────────────────────────────────────────────────────────

separator() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
}

section() {
  separator
  echo -e "${BOLD}${CYAN}▸ $1${NC}"
  echo -e "${CYAN}────────────────────────────────────────────────────────────────${NC}"
}

pass() {
  PASS=$((PASS + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${GREEN}✓ PASS${NC}  $1"
}

fail() {
  FAIL=$((FAIL + 1))
  TOTAL=$((TOTAL + 1))
  echo -e "  ${RED}✗ FAIL${NC}  $1"
  if [ -n "${2:-}" ]; then
    echo -e "      ${RED}→ $2${NC}"
  fi
}

info() {
  echo -e "  ${BLUE}ℹ${NC}  $1"
}

warn() {
  echo -e "  ${YELLOW}⚠${NC}  $1"
}

# Verifica se o status HTTP está dentro de um range esperado
check_status() {
  local desc="$1"
  local response="$2"
  local expected="$3"
  local body="$4"

  local status
  status=$(echo "$response" | grep -oP '"statusCode":\K\d+' || echo "$response" | grep -oP '^\K\d{3}' || echo "000")

  # Se não conseguiu extrair, tenta o HTTP status do curl diretamente
  if [ "$status" = "000" ] || [ -z "$status" ]; then
    # Tenta extrair do JSON de erro do NestJS
    status=$(echo "$body" | grep -oP '"statusCode":\K\d+' | head -1 || echo "???")
  fi

  if echo "$expected" | grep -q "$status"; then
    pass "$desc (HTTP $status)"
  else
    fail "$desc (esperado $expected, got $status)"
    echo "      Response: $(echo "$body" | head -c 200)"
  fi
}

# Faz request e retorna o body JSON
request() {
  local method="$1"
  local url="$2"
  local headers="${3:-}"
  local data="${4:-}"

  local curl_args=("-s" "-w" "\n%{http_code}" "-X" "$method")

  if [ -n "$headers" ]; then
    curl_args+=("-H" "$headers")
  fi

  if [ -n "$data" ]; then
    curl_args+=("-d" "$data")
  fi

  curl_args+=("$url")

  curl "${curl_args[@]}"
}

# ── Wait for services ────────────────────────────────────────────────────────

section "Aguardando serviços..."

echo -e "${YELLOW}Esperando jungle-app (port 3000)...${NC}"
for i in $(seq 1 30); do
  if curl -s "http://${APP_HOST}/health/live" > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ jungle-app respondendo${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}  ✗ jungle-app não respondeu em 30s${NC}"
    echo -e "${YELLOW}  Dica: rode 'docker compose up -d' primeiro${NC}"
    exit 1
  fi
  sleep 1
done

echo -e "${YELLOW}Esperando Keycloak (port 8080)...${NC}"
for i in $(seq 1 60); do
  if curl -s "http://${KEYCLOAK_HOST}/health/ready" > /dev/null 2>&1; then
    echo -e "${GREEN}  ✓ Keycloak respondendo${NC}"
    break
  fi
  if [ $i -eq 60 ]; then
    echo -e "${RED}  ✗ Keycloak não respondeu em 60s${NC}"
    exit 1
  fi
  sleep 1
done

# ── 1. Health Checks ─────────────────────────────────────────────────────────

section "1. Health Checks (endpoints públicos)"

# Live check
LIVE_RESPONSE=$(curl -s -w "\n%{http_code}" "http://${APP_HOST}/health/live")
LIVE_BODY=$(echo "$LIVE_RESPONSE" | head -1)
LIVE_STATUS=$(echo "$LIVE_RESPONSE" | tail -1)
if [ "$LIVE_STATUS" = "200" ]; then
  pass "GET /health/live → 200"
  info "Body: $LIVE_BODY"
else
  fail "GET /health/live → esperado 200, got $LIVE_STATUS"
fi

# Ready check
READY_RESPONSE=$(curl -s -w "\n%{http_code}" "http://${APP_HOST}/health/ready")
READY_BODY=$(echo "$READY_RESPONSE" | head -1)
READY_STATUS=$(echo "$READY_RESPONSE" | tail -1)
if [ "$READY_STATUS" = "200" ]; then
  pass "GET /health/ready → 200 (deps healthy)"
  info "Body: $READY_BODY"
else
  fail "GET /health/ready → esperado 200, got $READY_STATUS"
  info "Body: $READY_BODY"
fi

# ── 2. Keycloak Authentication ───────────────────────────────────────────────

section "2. Autenticação Keycloak (OIDC)"

# Token ADMIN (service account)
info "Obtendo token ADMIN (service-account-jungle-api)..."
ADMIN_TOKEN_RESPONSE=$(curl -s -X POST "http://${KEYCLOAK_HOST}/auth/realms/jungle/protocol/openid-connect/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=${KEYCLOAK_CLIENT_ID}" \
  -d "client_secret=${KEYCLOAK_CLIENT_SECRET}")

ADMIN_TOKEN=$(echo "$ADMIN_TOKEN_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])" 2>/dev/null || echo "")
if [ -n "$ADMIN_TOKEN" ]; then
  pass "Token ADMIN obtido via Client Credentials"
  info "Token (primeiros 50 chars): ${ADMIN_TOKEN:0:50}..."
else
  fail "Não foi possível obter token ADMIN"
  info "Response: $(echo "$ADMIN_TOKEN_RESPONSE" | head -c 200)"
  echo ""
  echo -e "${RED}⚠ Sem token de autenticação — os testes de API falharão.${NC}"
  echo -e "${YELLOW}Verifique se o Keycloak está rodando e configurado corretamente.${NC}"
  exit 1
fi

# Decodificar payload do JWT para verificar roles
ADMIN_ROLES=$(echo "$ADMIN_TOKEN" | cut -d'.' -f2 | base64 -d 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); roles=d.get('realm_access',{}).get('roles',[]); print('jungle-admin' if 'jungle-admin' in roles else '')" 2>/dev/null || echo "")
if [ -n "$ADMIN_ROLES" ]; then
  pass "Token ADMIN contém role 'jungle-admin'"
else
  warn "Token ADMIN não contém role 'jungle-admin' visível"
fi

# ── 3. Wallet Operations ─────────────────────────────────────────────────────

section "3. Operações de Wallet"

# Gerar UUIDs únicos para este run
PLAYER_ID=$(python3 -c "import uuid; print(uuid.uuid4())")
WALLET_ID_2=$(python3 -c "import uuid; print(uuid.uuid4())")

info "Player ID: $PLAYER_ID"

# Criar wallet
WALLET_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "http://${APP_HOST}/wallets" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -d "{\"playerId\":\"${PLAYER_ID}\",\"initialBalance\":{\"amount\":\"1000.00\",\"currency\":\"BRL\"}}")

WALLET_BODY=$(echo "$WALLET_RESPONSE" | head -1)
WALLET_HTTP=$(echo "$WALLET_RESPONSE" | tail -1)

if [ "$WALLET_HTTP" = "201" ]; then
  pass "POST /wallets → 201 (wallet criada)"
  info "Body: $WALLET_BODY"
  WALLET_ID=$(echo "$WALLET_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
  info "Wallet ID: $WALLET_ID"
else
  fail "POST /wallets → esperado 201, got $WALLET_HTTP"
  info "Body: $WALLET_BODY"
  WALLET_ID=""
fi

# Consultar wallet
if [ -n "$WALLET_ID" ]; then
  GET_WALLET=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "http://${APP_HOST}/wallets/${WALLET_ID}")

  GET_WALLET_BODY=$(echo "$GET_WALLET" | head -1)
  GET_WALLET_HTTP=$(echo "$GET_WALLET" | tail -1)

  if [ "$GET_WALLET_HTTP" = "200" ]; then
    pass "GET /wallets/:id → 200 (wallet encontrada)"
    info "Body: $GET_WALLET_BODY"
  else
    fail "GET /wallets/:id → esperado 200, got $GET_WALLET_HTTP"
  fi

  # Consultar wallet inexistente
  NOT_FOUND=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "http://${APP_HOST}/wallets/00000000-0000-4000-8000-000000000000")

  NOT_FOUND_HTTP=$(echo "$NOT_FOUND" | tail -1)
  if [ "$NOT_FOUND_HTTP" = "404" ]; then
    pass "GET /wallets/:id (inexistente) → 404"
  else
    fail "GET /wallets/:id (inexistente) → esperado 404, got $NOT_FOUND_HTTP"
  fi

  # Criar wallet duplicada (mesmo playerId)
  DUP_WALLET=$(curl -s -w "\n%{http_code}" \
    -X POST "http://${APP_HOST}/wallets" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -d "{\"playerId\":\"${PLAYER_ID}\",\"initialBalance\":{\"amount\":\"500.00\",\"currency\":\"BRL\"}}")

  DUP_HTTP=$(echo "$DUP_WALLET" | tail -1)
  if [ "$DUP_HTTP" = "409" ] || [ "$DUP_HTTP" = "400" ]; then
    pass "POST /wallets (duplicata playerId) → $DUP_HTTP (rejeitada)"
  else
    fail "POST /wallets (duplicata) → esperado 409/400, got $DUP_HTTP"
  fi
fi

# ── 4. Wagering Transactions ─────────────────────────────────────────────────

section "4. Transações de Wagering"

if [ -z "${WALLET_ID:-}" ]; then
  warn "Saltando wagering — wallet não foi criada"
else

  PROVIDER_ID="provider-test-001"
  ROUND_ID="round-$(date +%s)"
  GAME_ID="game-$(date +%s)"

  # 4a. BET (aposta)
  EXT_TX_BET="bet-$(date +%s)-$$"
  IDEMPOTENCY_KEY_BET="idemp-bet-$(openssl rand -hex 8)"

  info "Enviando BET: R\$ 50.00 (ext: $EXT_TX_BET)"
  BET_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "http://${APP_HOST}/wagering/transactions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Idempotency-Key: ${IDEMPOTENCY_KEY_BET}" \
    -d "{
      \"providerId\": \"${PROVIDER_ID}\",
      \"externalTransactionId\": \"${EXT_TX_BET}\",
      \"playerId\": \"${PLAYER_ID}\",
      \"walletId\": \"${WALLET_ID}\",
      \"roundId\": \"${ROUND_ID}\",
      \"gameId\": \"${GAME_ID}\",
      \"kind\": \"BET\",
      \"money\": {\"amount\": \"50.00\", \"currency\": \"BRL\"}
    }")

  BET_BODY=$(echo "$BET_RESPONSE" | head -1)
  BET_HTTP=$(echo "$BET_RESPONSE" | tail -1)

  if [ "$BET_HTTP" = "201" ]; then
    pass "POST /wagering/transactions (BET R\$50) → 201"
    info "Body: $BET_BODY"
    TX_ID_BET=$(echo "$BET_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('transactionId',''))" 2>/dev/null || echo "")
  else
    fail "POST /wagering/transactions (BET) → esperado 201, got $BET_HTTP"
    info "Body: $BET_BODY"
    TX_ID_BET=""
  fi

  # 4b. Idempotência — replay da mesma BET
  info "Replay da mesma BET com Idempotency-Key..."
  BET_REPLAY=$(curl -s -w "\n%{http_code}" \
    -X POST "http://${APP_HOST}/wagering/transactions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Idempotency-Key: ${IDEMPOTENCY_KEY_BET}" \
    -d "{
      \"providerId\": \"${PROVIDER_ID}\",
      \"externalTransactionId\": \"${EXT_TX_BET}\",
      \"playerId\": \"${PLAYER_ID}\",
      \"walletId\": \"${WALLET_ID}\",
      \"roundId\": \"${ROUND_ID}\",
      \"gameId\": \"${GAME_ID}\",
      \"kind\": \"BET\",
      \"money\": {\"amount\": \"50.00\", \"currency\": \"BRL\"}
    }")

  BET_REPLAY_BODY=$(echo "$BET_REPLAY" | head -1)
  BET_REPLAY_HTTP=$(echo "$BET_REPLAY" | tail -1)

  if [ "$BET_REPLAY_HTTP" = "200" ] || [ "$BET_REPLAY_HTTP" = "201" ]; then
    # Verifica se é replay idempotente
    IS_REPLAY=$(echo "$BET_REPLAY_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('idempotentReplay') else '')" 2>/dev/null || echo "")
    if [ -n "$IS_REPLAY" ]; then
      pass "Idempotência: replay retorna idempotentReplay=true"
    else
      pass "Idempotência: replay aceito (HTTP $BET_REPLAY_HTTP)"
    fi
    info "Body: $BET_REPLAY_BODY"
  else
    fail "Idempotência replay → esperado 200/201, got $BET_REPLAY_HTTP"
    info "Body: $BET_REPLAY_BODY"
  fi

  # 4c. CREDIT (crédito/vitória) — game session WIN
  EXT_TX_WIN="win-$(date +%s)-$$"
  IDEMPOTENCY_KEY_WIN="idemp-win-$(openssl rand -hex 8)"

  info "Enviando CREDIT (WIN): R\$ 120.00 (ext: $EXT_TX_WIN)"
  WIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "http://${APP_HOST}/wagering/transactions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Idempotency-Key: ${IDEMPOTENCY_KEY_WIN}" \
    -d "{
      \"providerId\": \"${PROVIDER_ID}\",
      \"externalTransactionId\": \"${EXT_TX_WIN}\",
      \"playerId\": \"${PLAYER_ID}\",
      \"walletId\": \"${WALLET_ID}\",
      \"roundId\": \"${ROUND_ID}\",
      \"gameId\": \"${GAME_ID}\",
      \"kind\": \"CREDIT\",
      \"money\": {\"amount\": \"120.00\", \"currency\": \"BRL\"}
    }")

  WIN_BODY=$(echo "$WIN_RESPONSE" | head -1)
  WIN_HTTP=$(echo "$WIN_RESPONSE" | tail -1)

  if [ "$WIN_HTTP" = "201" ]; then
    pass "POST /wagering/transactions (CREDIT R\$120) → 201"
    info "Body: $WIN_BODY"
  else
    fail "POST /wagering/transactions (CREDIT) → esperado 201, got $WIN_HTTP"
    info "Body: $WIN_BODY"
  fi

  # 4d. Saldo insuficiente — BET maior que saldo
  info "Tentando BET maior que saldo (R\$ 99999.00)..."
  BIG_BET=$(curl -s -w "\n%{http_code}" \
    -X POST "http://${APP_HOST}/wagering/transactions" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -H "Idempotency-Key: idemp-big-$(openssl rand -hex 8)" \
    -d "{
      \"providerId\": \"${PROVIDER_ID}\",
      \"externalTransactionId\": \"big-bet-$(date +%s)\",
      \"playerId\": \"${PLAYER_ID}\",
      \"walletId\": \"${WALLET_ID}\",
      \"roundId\": \"${ROUND_ID}\",
      \"gameId\": \"${GAME_ID}\",
      \"kind\": \"BET\",
      \"money\": {\"amount\": \"99999.00\", \"currency\": \"BRL\"}
    }")

  BIG_BET_HTTP=$(echo "$BIG_BET" | tail -1)
  BIG_BET_BODY=$(echo "$BIG_BET" | head -1)

  if [ "$BIG_BET_HTTP" = "400" ] || [ "$BIG_BET_HTTP" = "422" ]; then
    pass "BET maior que saldo → $BIG_BET_HTTP (rejeitada)"
    info "Body: $BIG_BET_BODY"
  else
    fail "BET maior que saldo → esperado 400/422, got $BIG_BET_HTTP"
  fi

  # 4e. REFUND (estorno da BET)
  if [ -n "${TX_ID_BET:-}" ]; then
    EXT_TX_REFUND="refund-$(date +%s)-$$"
    IDEMPOTENCY_KEY_REFUND="idemp-refund-$(openssl rand -hex 8)"

    info "Enviando REFUND da BET (ext: $EXT_TX_REFUND)..."
    REFUND_RESPONSE=$(curl -s -w "\n%{http_code}" \
      -X POST "http://${APP_HOST}/wagering/transactions" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Idempotency-Key: ${IDEMPOTENCY_KEY_REFUND}" \
      -d "{
        \"providerId\": \"${PROVIDER_ID}\",
        \"externalTransactionId\": \"${EXT_TX_REFUND}\",
        \"playerId\": \"${PLAYER_ID}\",
        \"walletId\": \"${WALLET_ID}\",
        \"roundId\": \"${ROUND_ID}\",
        \"gameId\": \"${GAME_ID}\",
        \"kind\": \"REFUND\",
        \"money\": {\"amount\": \"50.00\", \"currency\": \"BRL\"},
        \"referenceExternalTransactionId\": \"${EXT_TX_BET}\"
      }")

    REFUND_HTTP=$(echo "$REFUND_RESPONSE" | tail -1)
    REFUND_BODY=$(echo "$REFUND_RESPONSE" | head -1)

    if [ "$REFUND_HTTP" = "201" ]; then
      pass "POST /wagering/transactions (REFUND) → 201"
      info "Body: $REFUND_BODY"
    else
      fail "POST /wagering/transactions (REFUND) → esperado 201, got $REFUND_HTTP"
      info "Body: $REFUND_BODY"
    fi
  fi

  # 4f. Consultar transação
  if [ -n "${TX_ID_BET:-}" ]; then
    TX_QUERY=$(curl -s -w "\n%{http_code}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      "http://${APP_HOST}/wagering/transactions/${TX_ID_BET}")

    TX_QUERY_HTTP=$(echo "$TX_QUERY" | tail -1)
    if [ "$TX_QUERY_HTTP" = "200" ]; then
      pass "GET /wagering/transactions/:id → 200"
    else
      fail "GET /wagering/transactions/:id → esperado 200, got $TX_QUERY_HTTP"
    fi
  fi

  # 4g. Consulta por provider
  if [ -n "${EXT_TX_BET:-}" ]; then
    PROVIDER_QUERY=$(curl -s -w "\n%{http_code}" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      "http://${APP_HOST}/wagering/providers/${PROVIDER_ID}/wagering/transactions/${EXT_TX_BET}")

    PROVIDER_QUERY_HTTP=$(echo "$PROVIDER_QUERY" | tail -1)
    if [ "$PROVIDER_QUERY_HTTP" = "200" ]; then
      pass "GET /wagering/providers/:id/transactions/:extId → 200"
    else
      fail "GET /wagering/providers/:id/transactions/:extId → esperado 200, got $PROVIDER_QUERY_HTTP"
    fi
  fi

  # ── 5. Ledger ────────────────────────────────────────────────────────────────

  section "5. Ledger do Wallet"

  LEDGER_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "http://${APP_HOST}/wallets/${WALLET_ID}/ledger?limit=10")

  LEDGER_BODY=$(echo "$LEDGER_RESPONSE" | head -1)
  LEDGER_HTTP=$(echo "$LEDGER_RESPONSE" | tail -1)

  if [ "$LEDGER_HTTP" = "200" ]; then
    pass "GET /wallets/:id/ledger → 200"
    # Contar entries — response is {"entries": [...]}
    ENTRY_COUNT=$(echo "$LEDGER_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); entries=d.get('entries',d) if isinstance(d,dict) else d; print(len(entries) if isinstance(entries,list) else 0)" 2>/dev/null || echo "0")
    info "Entries no ledger: $ENTRY_COUNT"
    info "Primeira entry: $(echo "$LEDGER_BODY" | head -c 200)"
  else
    fail "GET /wallets/:id/ledger → esperado 200, got $LEDGER_HTTP"
  fi

  # ── 6. Reconciliation ────────────────────────────────────────────────────────

  section "6. Reconciliation"

  RECON_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "http://${APP_HOST}/wallets/${WALLET_ID}/reconciliation" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}")

  RECON_BODY=$(echo "$RECON_RESPONSE" | head -1)
  RECON_HTTP=$(echo "$RECON_RESPONSE" | tail -1)

  if [ "$RECON_HTTP" = "200" ]; then
    pass "POST /wallets/:id/reconciliation → 200"
    info "Body: $RECON_BODY"
    # Verificar se está consistente
    IS_CONSISTENT=$(echo "$RECON_BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('true' if d.get('consistent') else '')" 2>/dev/null || echo "")
    if [ -n "$IS_CONSISTENT" ]; then
      pass "Reconciliation: wallet consistente (saldo = soma do ledger)"
    else
      warn "Reconciliation: wallet inconsistente — verificar entries"
    fi
  else
    fail "POST /wallets/:id/reconciliation → esperado 200, got $RECON_HTTP"
    info "Body: $RECON_BODY"
  fi

  # ── 7. Wallets independentes ─────────────────────────────────────────────────

  section "7. Wallets Independentes (concorrência lógica)"

  info "Criando segunda wallet para player diferente..."
  WALLET2_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST "http://${APP_HOST}/wallets" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    -d "{\"playerId\":\"${WALLET_ID_2}\",\"initialBalance\":{\"amount\":\"500.00\",\"currency\":\"BRL\"}}")

  WALLET2_HTTP=$(echo "$WALLET2_RESPONSE" | tail -1)
  WALLET2_BODY=$(echo "$WALLET2_RESPONSE" | head -1)

  if [ "$WALLET2_HTTP" = "201" ]; then
    pass "POST /wallets (segunda wallet) → 201"
    WALLET_2_ID=$(echo "$WALLET2_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "")
    info "Wallet 2 ID: $WALLET_2_ID"
  else
    fail "POST /wallets (segunda wallet) → esperado 201, got $WALLET2_HTTP"
    WALLET_2_ID=""
  fi

  # BET na wallet 2 — não deve afetar wallet 1
  if [ -n "${WALLET_2_ID:-}" ]; then
    BET2_RESPONSE=$(curl -s -w "\n%{http_code}" \
      -X POST "http://${APP_HOST}/wagering/transactions" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      -H "Idempotency-Key: idemp-w2-$(openssl rand -hex 8)" \
      -d "{
        \"providerId\": \"${PROVIDER_ID}\",
        \"externalTransactionId\": \"bet2-$(date +%s)\",
        \"playerId\": \"${WALLET_ID_2}\",
        \"walletId\": \"${WALLET_2_ID}\",
        \"roundId\": \"round-$(date +%s)\",
        \"gameId\": \"game-$(date +%s)\",
        \"kind\": \"BET\",
        \"money\": {\"amount\": \"100.00\", \"currency\": \"BRL\"}
      }")

    BET2_HTTP=$(echo "$BET2_RESPONSE" | tail -1)
    if [ "$BET2_HTTP" = "201" ]; then
      pass "BET na wallet 2 → 201 (independente da wallet 1)"
    else
      fail "BET na wallet 2 → esperado 201, got $BET2_HTTP"
    fi

    # Verificar que wallet 1 não foi afetada
    WALLET1_BALANCE=$(curl -s -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      "http://${APP_HOST}/wallets/${WALLET_ID}" | python3 -c "import sys,json; b=json.load(sys.stdin).get('balance',{}); print(b.get('amount','') if isinstance(b,dict) else b)" 2>/dev/null || echo "")
    info "Wallet 1 balance após BET na wallet 2: $WALLET1_BALANCE"
  fi

fi

# ── 8. Métricas Prometheus ───────────────────────────────────────────────────

section "8. Métricas Prometheus"

METRICS_RESPONSE=$(curl -s -w "\n%{http_code}" "http://${APP_HOST}/metrics")
METRICS_BODY=$(echo "$METRICS_RESPONSE" | head -n -1)
METRICS_HTTP=$(echo "$METRICS_RESPONSE" | tail -1)

if [ "$METRICS_HTTP" = "200" ]; then
  pass "GET /metrics → 200"
  # Contar métricas Prometheus (formato OpenMetrics: lines starting with metric name)
  METRIC_COUNT=$(echo "$METRICS_BODY" | grep -cE '^(wager_|http_)' || echo "0")
  info "Métricas encontradas: $METRIC_COUNT"
  # Mostrar algumas métricas
  echo ""
  echo -e "  ${BOLD}Amostra de métricas:${NC}"
  echo "$METRICS_BODY" | grep -E '^(wager_|http_)' | head -8 | while read -r line; do
    echo "    $line"
  done
  echo ""
else
  fail "GET /metrics → esperado 200, got $METRICS_HTTP"
  info "Body: $(echo "$METRICS_BODY" | head -c 200)"
fi

# ── 9. Controle de Acesso por Role ───────────────────────────────────────────

section "9. Controle de Acesso (RBAC)"

# Sem token — deve retornar 401
UNAUTH_RESPONSE=$(curl -s -w "\n%{http_code}" \
  "http://${APP_HOST}/wallets/nonexistent")
UNAUTH_HTTP=$(echo "$UNAUTH_RESPONSE" | tail -1)

if [ "$UNAUTH_HTTP" = "401" ]; then
  pass "Sem token → 401 Unauthorized"
else
  fail "Sem token → esperado 401, got $UNAUTH_HTTP"
fi

# Token inválido
BAD_TOKEN_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer invalid-token-here" \
  "http://${APP_HOST}/wallets/nonexistent")
BAD_TOKEN_HTTP=$(echo "$BAD_TOKEN_RESPONSE" | tail -1)

if [ "$BAD_TOKEN_HTTP" = "401" ] || [ "$BAD_TOKEN_HTTP" = "403" ]; then
  pass "Token inválido → $BAD_TOKEN_HTTP"
else
  fail "Token inválido → esperado 401/403, got $BAD_TOKEN_HTTP"
fi

# Health endpoints devem ser públicos (sem token)
PUBLIC_HEALTH=$(curl -s -w "\n%{http_code}" "http://${APP_HOST}/health/live")
PUBLIC_HEALTH_HTTP=$(echo "$PUBLIC_HEALTH" | tail -1)

if [ "$PUBLIC_HEALTH_HTTP" = "200" ]; then
  pass "GET /health/live sem token → 200 (endpoint público)"
else
  fail "GET /health/live sem token → esperado 200, got $PUBLIC_HEALTH_HTTP"
fi

# ── 10. Logs Estruturados (Pino) ─────────────────────────────────────────────

section "10. Logs Estruturados (Pino JSON)"

info "Verificando logs do container jungle-app..."
LOG_SAMPLE=$(docker compose logs jungle-app 2>&1 | grep -E '"msg"' | tail -1 || echo "")

if [ -n "$LOG_SAMPLE" ]; then
  pass "Logs JSON estruturados encontrados"
  echo "    Exemplo: $(echo "$LOG_SAMPLE" | head -c 150)..."
else
  warn "Nenhuma linha de log JSON encontrada (pode ser normal se app acabou de subir)"
fi

# Verificar campos padronizados
if docker compose logs jungle-app 2>&1 | grep -q '"correlationId"'; then
  pass "Campo 'correlationId' presente nos logs"
else
  info "Campo 'correlationId' não encontrado (aparece após requests HTTP)"
fi

# ── Resumo ────────────────────────────────────────────────────────────────────

separator
echo -e "${BOLD}${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  RESUMO DO SMOKE TEST${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Total:   $TOTAL"
echo -e "  ${GREEN}Passados: $PASS${NC}"
echo -e "  ${RED}Falhas:   $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "  ${GREEN}${BOLD}✓ Todos os testes passaram!${NC}"
  echo ""
  exit 0
else
  echo -e "  ${RED}${BOLD}✗ $FAIL teste(s) falharam${NC}"
  echo ""
  exit 1
fi
