export interface FailureCodeDefinition {
  code: string;
  category: 'Business' | 'Infrastructure';
  description: string;
  retryable: boolean;
}

export const FailureCode = {
  // Business errors — not retryable
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  INVALID_CURRENCY: 'INVALID_CURRENCY',
  INVALID_AMOUNT: 'INVALID_AMOUNT',
  REFERENCE_NOT_FOUND: 'REFERENCE_NOT_FOUND',
  REFERENCE_ALREADY_REVERSED: 'REFERENCE_ALREADY_REVERSED',
  REFERENCE_INVALID_KIND: 'REFERENCE_INVALID_KIND',
  REFERENCE_MISMATCH: 'REFERENCE_MISMATCH',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  WALLET_NOT_FOUND: 'WALLET_NOT_FOUND',
  WALLET_ALREADY_EXISTS: 'WALLET_ALREADY_EXISTS',
  INVALID_TRANSACTION_KIND: 'INVALID_TRANSACTION_KIND',
  REFERENCE_VALUE_MISMATCH: 'REFERENCE_VALUE_MISMATCH',
  REVERSAL_WOULD_NEGATIVE_BALANCE: 'REVERSAL_WOULD_NEGATIVE_BALANCE',
  REFERENCE_EXPIRED: 'REFERENCE_EXPIRED',
  // Infrastructure errors — retryable
  INFRASTRUCTURE_ERROR: 'INFRASTRUCTURE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  MESSAGE_SERIALIZATION_ERROR: 'MESSAGE_SERIALIZATION_ERROR',
} as const;

export type FailureCode = (typeof FailureCode)[keyof typeof FailureCode];

export const FailureCodeDefinitions: FailureCodeDefinition[] = [
  { code: 'INSUFFICIENT_BALANCE', category: 'Business', description: 'Saldo insuficiente para débito', retryable: false },
  { code: 'INVALID_CURRENCY', category: 'Business', description: 'Moeda incompatível com wallet', retryable: false },
  { code: 'INVALID_AMOUNT', category: 'Business', description: 'Valor inválido (negativo, escala)', retryable: false },
  { code: 'REFERENCE_NOT_FOUND', category: 'Business', description: 'Referência externa não encontrada', retryable: true },
  { code: 'REFERENCE_ALREADY_REVERSED', category: 'Business', description: 'Referência já revertida pelo mesmo tipo', retryable: false },
  { code: 'REFERENCE_INVALID_KIND', category: 'Business', description: 'Referência com kind incompatível', retryable: false },
  { code: 'REFERENCE_MISMATCH', category: 'Business', description: 'Referência não pertence ao mesmo player/wallet/rodada', retryable: false },
  { code: 'IDEMPOTENCY_CONFLICT', category: 'Business', description: 'Mesma key com payload diferente', retryable: false },
  { code: 'WALLET_NOT_FOUND', category: 'Business', description: 'Wallet não existe', retryable: false },
  { code: 'WALLET_ALREADY_EXISTS', category: 'Business', description: 'Wallet duplicada para playerId+currency', retryable: false },
  { code: 'INVALID_TRANSACTION_KIND', category: 'Business', description: 'Kind de transação inválido', retryable: false },
  { code: 'REFERENCE_VALUE_MISMATCH', category: 'Business', description: 'Valor de REFUND/ROLLBACK diferente da referência', retryable: false },
  { code: 'REVERSAL_WOULD_NEGATIVE_BALANCE', category: 'Business', description: 'Reversão produziria saldo negativo', retryable: false },
  { code: 'REFERENCE_EXPIRED', category: 'Business', description: 'Referência expirou após tentativas máximas', retryable: false },
  { code: 'INFRASTRUCTURE_ERROR', category: 'Infrastructure', description: 'Erro transitório de infraestrutura', retryable: true },
  { code: 'DATABASE_ERROR', category: 'Infrastructure', description: 'Erro de banco de dados', retryable: true },
  { code: 'MESSAGE_SERIALIZATION_ERROR', category: 'Infrastructure', description: 'Erro de serialização de mensagem', retryable: false },
];

export function isRetryableFailure(code: string): boolean {
  const def = FailureCodeDefinitions.find((d) => d.code === code);
  return def?.retryable ?? false;
}
