import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager, InjectRepository } from '@mikro-orm/nestjs';
import { EntityManager } from '@mikro-orm/core';
import { WagerTransactionRepository } from '@infrastructure/persistence/wager-transaction.repository';
import { WalletRepository } from '@infrastructure/persistence/wallet.repository';
import { WalletLedgerEntryRepository } from '@infrastructure/persistence/wallet-ledger-entry.repository';
import { WagerTransactionEntity } from '@infrastructure/persistence/wager-transaction.entity';
import { WalletEntity } from '@infrastructure/persistence/wallet.entity';
import { WalletLedgerEntryEntity } from '@infrastructure/persistence/wallet-ledger-entry.entity';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '@domain/transaction';
import { LedgerDirection } from '@domain/ledger';
import { FailureCode } from '@domain/failure';
import { Money } from '@domain/money';
import { Wallet } from '@domain/wallet';
import { WalletNotFoundError } from '@domain/errors/domain.error';

export interface PendingReferenceConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  ttlMs: number;
}

export const DEFAULT_PENDING_REFERENCE_CONFIG: PendingReferenceConfig = {
  baseDelayMs: 5_000,    // 5s
  maxDelayMs: 300_000,   // 5min
  maxAttempts: 10,
  ttlMs: 300_000,        // 5min TTL
};

@Injectable()
export class PendingReferenceWorker {
  private readonly logger = new Logger(PendingReferenceWorker.name);
  private readonly config: PendingReferenceConfig;
  private em: EntityManager;

  constructor(
    @InjectEntityManager('default') em: EntityManager,
    @InjectRepository(WagerTransactionEntity) private readonly transactionRepository: WagerTransactionRepository,
    @InjectRepository(WalletEntity) private readonly walletRepository: WalletRepository,
    @InjectRepository(WalletLedgerEntryEntity) private readonly ledgerRepository: WalletLedgerEntryRepository,
    @Optional() config?: Partial<PendingReferenceConfig>,
  ) {
    this.em = em;
    this.config = { ...DEFAULT_PENDING_REFERENCE_CONFIG, ...config };
  }

  /**
   * Scheduled worker: every 30 seconds, process PENDING_REFERENCE transactions
   * whose nextAttemptAt <= now.
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async process(): Promise<void> {
    const now = new Date();
    const pending = await this.transactionRepository.findPendingReferencesDue(now);

    this.logger.debug(`Found ${pending.length} pending reference transactions`);

    for (const tx of pending) {
      await this.processOne(tx);
    }
  }

  /**
   * Process a single PENDING_REFERENCE transaction.
   */
  async processOne(tx: any): Promise<void> {
    const txId = tx.id;
    this.logger.debug(
      `Processing pending reference: ${txId} (attempt ${tx.attempts + 1})`,
    );

    // Check TTL
    const age = Date.now() - tx.createdAt.getTime();
    if (age > this.config.ttlMs) {
      await this.rejectTransaction(tx, FailureCode.REFERENCE_NOT_FOUND);
      this.logger.warn(`TTL exceeded for ${txId}, rejected with REFERENCE_NOT_FOUND`);
      return;
    }

    // Check max attempts
    if (tx.attempts >= this.config.maxAttempts) {
      await this.rejectTransaction(tx, FailureCode.REFERENCE_NOT_FOUND);
      this.logger.warn(
        `Max attempts exceeded for ${txId}, rejected with REFERENCE_NOT_FOUND`,
      );
      return;
    }

    // Try to resolve the reference
    const refTx = await this.transactionRepository.findByProviderAndExternalId(
      tx.providerId,
      tx.referenceExternalTransactionId,
    );

    if (!refTx || refTx.status !== WagerTransactionStatus.Processed) {
      // Reference not yet available — schedule retry with backoff
      const delay = this.calculateBackoff(tx.attempts);
      const nextAttemptAt = new Date(Date.now() + delay);
      tx.attempts += 1;
      tx.nextAttemptAt = nextAttemptAt;
      await this.transactionRepository.update(tx);
      this.logger.debug(
        `Reference not found for ${txId}, retrying in ${delay}ms (attempt ${tx.attempts})`,
      );
      return;
    }

    // Reference found and processed — process this transaction within a lock
    await this.em.transactional(async () => {
      const walletEntity = await this.walletRepository.findOneForUpdate(tx.walletId);
      if (!walletEntity) {
        throw new WalletNotFoundError(`Wallet ${tx.walletId} not found`);
      }

      const money = Money.from({
        amount: tx.moneyAmount,
        currency: tx.moneyCurrency,
      });

      const walletState = {
        id: walletEntity.id,
        playerId: walletEntity.playerId,
        balanceAmount: walletEntity.balanceAmount,
        currency: walletEntity.currency,
        version: walletEntity.version,
        createdAt: walletEntity.createdAt,
        updatedAt: walletEntity.updatedAt,
      };
      const wallet = Wallet.rehydrate(walletState);

      const direction = this.getLedgerDirection(tx.kind);
      const ledgerEntry =
        direction === LedgerDirection.Debit
          ? wallet.debit(money, txId)
          : wallet.credit(money, txId);

      const updatedState = wallet.toJSON();
      walletEntity.balanceAmount = updatedState.balanceAmount;
      walletEntity.version = updatedState.version;

      // Update transaction status
      tx.status = WagerTransactionStatus.Processed;
      tx.referenceTransactionId = refTx.id;
      tx.processedAt = new Date();
      await this.transactionRepository.update(tx);

      // Persist ledger entry
      const ledgerState = ledgerEntry.toJSON();
      const ledgerEntity = this.em.create('WalletLedgerEntryEntity', {
        id: ledgerState.id,
        walletId: tx.walletId,
        transactionId: txId,
        direction: ledgerState.direction,
        amount: ledgerState.amount,
        currency: ledgerState.currency,
        balanceBefore: ledgerState.balanceBefore,
        balanceAfter: ledgerState.balanceAfter,
      });
      await this.ledgerRepository.create(ledgerEntity);

      await this.em.flush();
    });

    this.logger.log(`Processed pending reference ${txId} → PROCESSED`);
  }

  /**
   * Calculate exponential backoff delay.
   * delay = min(baseDelay * 2^attempt, maxDelay)
   */
  calculateBackoff(attempt: number): number {
    const delay = this.config.baseDelayMs * Math.pow(2, attempt);
    return Math.min(delay, this.config.maxDelayMs);
  }

  /**
   * Reject a PENDING_REFERENCE transaction with a failure code.
   */
  async rejectTransaction(tx: any, failureCode: FailureCode): Promise<void> {
    tx.status = WagerTransactionStatus.Rejected;
    tx.failureCode = failureCode;
    tx.processedAt = new Date();
    await this.transactionRepository.update(tx);
  }

  private getLedgerDirection(kind: string): LedgerDirection {
    switch (kind) {
      case WagerTransactionKind.Bet:
      case WagerTransactionKind.Loss:
        return LedgerDirection.Debit;
      case WagerTransactionKind.Win:
      case WagerTransactionKind.Refund:
      case WagerTransactionKind.Rollback:
      case WagerTransactionKind.Opening:
        return LedgerDirection.Credit;
      default:
        return LedgerDirection.Debit;
    }
  }
}
