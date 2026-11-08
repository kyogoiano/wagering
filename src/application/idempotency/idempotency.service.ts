import { Injectable } from '@nestjs/common';
import { WagerTransactionRepository } from '@infrastructure/persistence/wager-transaction.repository';
import { computePayloadHash, ProcessTransactionInput } from '@application/wager/process-transaction.usecase';
import { IdempotencyConflictError } from '@domain/errors/domain.error';

export interface IdempotencyCheckResult {
  /** True if this is a replay of an already-processed transaction */
  isDuplicate: boolean;
  /** Cached result from the original processing */
  cachedResult?: {
    transactionId: string;
    status: string;
    balanceAmount: string;
    balanceCurrency: string;
  };
}

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly transactionRepository: WagerTransactionRepository,
  ) {}

  /**
   * Check if a transaction with the given idempotencyKey already exists.
   * If it does, verify the payloadHash matches (replay) or conflicts (409).
   */
  async check(input: ProcessTransactionInput): Promise<IdempotencyCheckResult> {
    const existing = await this.transactionRepository.findByIdempotencyKey(input.idempotencyKey);
    if (!existing) {
      return { isDuplicate: false };
    }

    // Transaction exists — verify payload hash
    const expectedHash = computePayloadHash(input);
    if (existing.payloadHash !== expectedHash) {
      throw new IdempotencyConflictError(
        `Idempotency key ${input.idempotencyKey} already exists with a different payload`,
      );
    }

    // Payload matches — return cached result (idempotent replay)
    return {
      isDuplicate: true,
      cachedResult: {
        transactionId: existing.id,
        status: existing.status,
        balanceAmount: existing.moneyAmount,
        balanceCurrency: existing.moneyCurrency,
      },
    };
  }

  /**
   * Alternative check by provider + externalTransactionId (secondary dedup key).
   */
  async checkByProviderExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<IdempotencyCheckResult> {
    const existing = await this.transactionRepository.findByProviderAndExternalId(
      providerId,
      externalTransactionId,
    );
    if (!existing) {
      return { isDuplicate: false };
    }

    return {
      isDuplicate: true,
      cachedResult: {
        transactionId: existing.id,
        status: existing.status,
        balanceAmount: existing.moneyAmount,
        balanceCurrency: existing.moneyCurrency,
      },
    };
  }
}
