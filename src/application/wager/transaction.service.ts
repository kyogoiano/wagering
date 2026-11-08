import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { WalletRepository } from '@infrastructure/persistence/wallet.repository';
import { WagerTransactionRepository } from '@infrastructure/persistence/wager-transaction.repository';
import { WalletLedgerEntryRepository } from '@infrastructure/persistence/wallet-ledger-entry.repository';
import { Money } from '@domain/money';
import { Wallet } from '@domain/wallet';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '@domain/transaction';
import { LedgerDirection } from '@domain/ledger';
import { FailureCode } from '@domain/failure';
import {
  WalletNotFoundError,
  InsufficientBalanceError,
  ReferenceNotFoundError,

} from '@domain/errors/domain.error';
import {
  computePayloadHash,
  ProcessTransactionInput,
} from '@application/wager/process-transaction.usecase';
import { IdempotencyService } from '@application/idempotency/idempotency.service';

export interface SubmitTransactionInput {
  idempotencyKey: string;
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: WagerTransactionKind;
  moneyAmount: string;
  moneyCurrency: string;
  referenceExternalTransactionId?: string;
}

export interface SubmitTransactionOutput {
  transactionId: string;
  status: WagerTransactionStatus;
  balance: { amount: string; currency: string };
  idempotentReplay: boolean;
}

export interface TransactionDetailOutput {
  id: string;
  providerId: string;
  externalTransactionId: string;
  status: string;
  kind: string;
  money: { amount: string; currency: string };
  walletId: string;
  processedAt?: string;
}

@Injectable()
export class TransactionService {
  private em: EntityManager;
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly transactionRepository: WagerTransactionRepository,
    private readonly ledgerRepository: WalletLedgerEntryRepository,
    private readonly idempotencyService: IdempotencyService,
  ) {
    this.em = walletRepository.em;
  }

  async submit(input: SubmitTransactionInput): Promise<SubmitTransactionOutput> {
    const money = Money.from({
      amount: input.moneyAmount,
      currency: input.moneyCurrency,
    });

    const processInput: ProcessTransactionInput = {
      idempotencyKey: input.idempotencyKey,
      providerId: input.providerId,
      externalTransactionId: input.externalTransactionId,
      playerId: input.playerId,
      walletId: input.walletId,
      roundId: input.roundId,
      gameId: input.gameId,
      kind: input.kind,
      money,
      referenceExternalTransactionId: input.referenceExternalTransactionId,
    };

    // Check idempotency by idempotencyKey (with payload hash conflict detection)
    const idempotencyResult = await this.idempotencyService.check(processInput);
    if (idempotencyResult.isDuplicate && idempotencyResult.cachedResult) {
      return {
        transactionId: idempotencyResult.cachedResult.transactionId,
        status: idempotencyResult.cachedResult.status as WagerTransactionStatus,
        balance: {
          amount: idempotencyResult.cachedResult.balanceAmount,
          currency: idempotencyResult.cachedResult.balanceCurrency,
        },
        idempotentReplay: true,
      };
    }

    // Check idempotency by provider + externalTransactionId (secondary dedup)
    const providerResult = await this.idempotencyService.checkByProviderExternalId(
      input.providerId,
      input.externalTransactionId,
    );
    if (providerResult.isDuplicate && providerResult.cachedResult) {
      return {
        transactionId: providerResult.cachedResult.transactionId,
        status: providerResult.cachedResult.status as WagerTransactionStatus,
        balance: {
          amount: providerResult.cachedResult.balanceAmount,
          currency: providerResult.cachedResult.balanceCurrency,
        },
        idempotentReplay: true,
      };
    }

    // Process within a transaction with pessimistic lock on wallet
    return this.em.transactional(async () => {
      // Lock wallet row
      const walletEntity = await this.walletRepository.findOneForUpdate(input.walletId);
      if (!walletEntity) {
        throw new WalletNotFoundError(`Wallet ${input.walletId} not found`);
      }

      // Rehydrate domain wallet
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

      // Check currency match
      if (wallet.currency !== money.currency) {
        throw new Error(
          `Currency mismatch: wallet is ${wallet.currency}, transaction is ${money.currency}`,
        );
      }

      // Handle reference resolution for REFUND/ROLLBACK
      let referenceExternalTransactionId: string | undefined;
      const needsRef =
        input.kind === WagerTransactionKind.Refund ||
        input.kind === WagerTransactionKind.Rollback;
      if (needsRef) {
        if (!input.referenceExternalTransactionId) {
          throw new ReferenceNotFoundError(
            `Kind ${input.kind} requires referenceExternalTransactionId`,
          );
        }
        const refTx = await this.transactionRepository.findByProviderAndExternalId(
          input.providerId,
          input.referenceExternalTransactionId,
        );
        if (!refTx) {
          // Reference not found — persist as PENDING_REFERENCE
          const txId = crypto.randomUUID();
          const payloadHash = computePayloadHash(processInput);
          const txEntity = this.em.create('WagerTransactionEntity', {
            id: txId,
            providerId: input.providerId,
            externalTransactionId: input.externalTransactionId,
            idempotencyKey: input.idempotencyKey,
            payloadHash,
            walletId: input.walletId,
            playerId: input.playerId,
            roundId: input.roundId,
            gameId: input.gameId,
            kind: input.kind,
            moneyAmount: money.amount,
            moneyCurrency: money.currency,
            referenceExternalTransactionId: input.referenceExternalTransactionId,
            status: WagerTransactionStatus.PendingReference,
            attempts: 0,
            nextAttemptAt: new Date(Date.now() + 5_000),
          });
          await this.transactionRepository.create(txEntity);
          await this.em.flush();

          return {
            transactionId: txId,
            status: WagerTransactionStatus.PendingReference,
            balance: { amount: wallet.balance.amount, currency: wallet.currency },
            idempotentReplay: false,
          };
        }
        if (refTx.status !== WagerTransactionStatus.Processed) {
          // Reference exists but not yet processed — PENDING_REFERENCE
          const txId = crypto.randomUUID();
          const payloadHash = computePayloadHash(processInput);
          const txEntity = this.em.create('WagerTransactionEntity', {
            id: txId,
            providerId: input.providerId,
            externalTransactionId: input.externalTransactionId,
            idempotencyKey: input.idempotencyKey,
            payloadHash,
            walletId: input.walletId,
            playerId: input.playerId,
            roundId: input.roundId,
            gameId: input.gameId,
            kind: input.kind,
            moneyAmount: money.amount,
            moneyCurrency: money.currency,
            referenceExternalTransactionId: input.referenceExternalTransactionId,
            status: WagerTransactionStatus.PendingReference,
            attempts: 0,
            nextAttemptAt: new Date(Date.now() + 5_000),
          });
          await this.transactionRepository.create(txEntity);
          await this.em.flush();

          return {
            transactionId: txId,
            status: WagerTransactionStatus.PendingReference,
            balance: { amount: wallet.balance.amount, currency: wallet.currency },
            idempotentReplay: false,
          };
        }
        referenceExternalTransactionId = input.referenceExternalTransactionId;
      }

      const txId = crypto.randomUUID();
      const payloadHash = computePayloadHash(processInput);

      // LOSS does not affect balance — just record the transaction
      if (input.kind === WagerTransactionKind.Loss) {
        const txEntity = this.em.create('WagerTransactionEntity', {
          id: txId,
          providerId: input.providerId,
          externalTransactionId: input.externalTransactionId,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
          walletId: input.walletId,
          playerId: input.playerId,
          roundId: input.roundId,
          gameId: input.gameId,
          kind: input.kind,
          moneyAmount: money.amount,
          moneyCurrency: money.currency,
          referenceExternalTransactionId,
          status: WagerTransactionStatus.Processed,
          attempts: 0,
          processedAt: new Date(),
        });
        await this.transactionRepository.create(txEntity);
        await this.em.flush();

        return {
          transactionId: txId,
          status: WagerTransactionStatus.Processed,
          balance: { amount: wallet.balance.amount, currency: wallet.currency },
          idempotentReplay: false,
        };
      }

      // For transactions that affect balance: debit or credit
      const direction = this.getLedgerDirection(input.kind);

      try {
        let ledgerEntry;
        if (direction === LedgerDirection.Debit) {
          ledgerEntry = wallet.debit(money, txId);
        } else {
          ledgerEntry = wallet.credit(money, txId);
        }

        // Update wallet entity
        const updatedState = wallet.toJSON();
        walletEntity.balanceAmount = updatedState.balanceAmount;
        walletEntity.version = updatedState.version;

        // Persist transaction
        const txEntity = this.em.create('WagerTransactionEntity', {
          id: txId,
          providerId: input.providerId,
          externalTransactionId: input.externalTransactionId,
          idempotencyKey: input.idempotencyKey,
          payloadHash,
          walletId: input.walletId,
          playerId: input.playerId,
          roundId: input.roundId,
          gameId: input.gameId,
          kind: input.kind,
          moneyAmount: money.amount,
          moneyCurrency: money.currency,
          referenceExternalTransactionId,
          status: WagerTransactionStatus.Processed,
          attempts: 0,
          processedAt: new Date(),
        });
        await this.transactionRepository.create(txEntity);

        // Persist ledger entry
        const ledgerState = ledgerEntry.toJSON();
        const ledgerEntity = this.em.create('WalletLedgerEntryEntity', {
          id: ledgerState.id,
          walletId: input.walletId,
          transactionId: txId,
          direction: ledgerState.direction,
          amount: ledgerState.amount,
          currency: ledgerState.currency,
          balanceBefore: ledgerState.balanceBefore,
          balanceAfter: ledgerState.balanceAfter,
        });
        await this.ledgerRepository.create(ledgerEntity);

        await this.em.flush();

        return {
          transactionId: txId,
          status: WagerTransactionStatus.Processed,
          balance: { amount: wallet.balance.amount, currency: wallet.currency },
          idempotentReplay: false,
        };
      } catch (error) {
        if (error instanceof InsufficientBalanceError) {
          // Persist rejected transaction
          const txEntity = this.em.create('WagerTransactionEntity', {
            id: txId,
            providerId: input.providerId,
            externalTransactionId: input.externalTransactionId,
            idempotencyKey: input.idempotencyKey,
            payloadHash,
            walletId: input.walletId,
            playerId: input.playerId,
            roundId: input.roundId,
            gameId: input.gameId,
            kind: input.kind,
            moneyAmount: money.amount,
            moneyCurrency: money.currency,
            referenceExternalTransactionId,
            status: WagerTransactionStatus.Rejected,
            failureCode: FailureCode.INSUFFICIENT_BALANCE,
            attempts: 0,
            processedAt: new Date(),
          });
          await this.transactionRepository.create(txEntity);
          await this.em.flush();

          return {
            transactionId: txId,
            status: WagerTransactionStatus.Rejected,
            balance: { amount: wallet.balance.amount, currency: wallet.currency },
            idempotentReplay: false,
          };
        }
        throw error;
      }
    });
  }

  async getById(transactionId: string): Promise<TransactionDetailOutput> {
    const tx = await this.transactionRepository.findById(transactionId);
    if (!tx) {
      throw new WalletNotFoundError(`Transaction ${transactionId} not found`);
    }
    return this.mapToDetail(tx);
  }

  async getByProvider(
    providerId: string,
    externalTransactionId: string,
  ): Promise<TransactionDetailOutput> {
    const tx = await this.transactionRepository.findByProviderAndExternalId(
      providerId,
      externalTransactionId,
    );
    if (!tx) {
      throw new WalletNotFoundError(
        `Transaction for provider ${providerId} with external ID ${externalTransactionId} not found`,
      );
    }
    return this.mapToDetail(tx);
  }

  private getLedgerDirection(kind: WagerTransactionKind): LedgerDirection {
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

  private buildOutputFromEntity(
    tx: any,
    idempotentReplay: boolean,
  ): SubmitTransactionOutput {
    return {
      transactionId: tx.id,
      status: tx.status,
      balance: {
        amount: tx.moneyAmount,
        currency: tx.moneyCurrency,
      },
      idempotentReplay,
    };
  }

  private mapToDetail(tx: any): TransactionDetailOutput {
    return {
      id: tx.id,
      providerId: tx.providerId,
      externalTransactionId: tx.externalTransactionId,
      status: tx.status,
      kind: tx.kind,
      money: { amount: tx.moneyAmount, currency: tx.moneyCurrency },
      walletId: tx.walletId,
      processedAt: tx.processedAt ? tx.processedAt.toISOString() : undefined,
    };
  }
}
