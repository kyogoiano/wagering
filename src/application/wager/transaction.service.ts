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
import { computePayloadHash } from '@application/wager/process-transaction.usecase';

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
  constructor(
    private readonly em: EntityManager,
    private readonly walletRepository: WalletRepository,
    private readonly transactionRepository: WagerTransactionRepository,
    private readonly ledgerRepository: WalletLedgerEntryRepository,
  ) {}

  async submit(input: SubmitTransactionInput): Promise<SubmitTransactionOutput> {
    // Check idempotency by idempotencyKey
    const existingByIdempotency = await this.transactionRepository.findByIdempotencyKey(
      input.idempotencyKey,
    );
    if (existingByIdempotency) {
      return this.buildOutputFromEntity(existingByIdempotency, true);
    }

    // Check idempotency by provider + externalTransactionId
    const existingByProvider = await this.transactionRepository.findByProviderAndExternalId(
      input.providerId,
      input.externalTransactionId,
    );
    if (existingByProvider) {
      return this.buildOutputFromEntity(existingByProvider, true);
    }

    // Process within a transaction with pessimistic lock on wallet
    return this.em.transactional(async () => {
      // Lock wallet row
      const walletEntity = await this.walletRepository.findOneForUpdate(input.walletId);
      if (!walletEntity) {
        throw new WalletNotFoundError(`Wallet ${input.walletId} not found`);
      }

      const money = Money.from({
        amount: input.moneyAmount,
        currency: input.moneyCurrency,
      });

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
          throw new ReferenceNotFoundError(
            `Reference transaction ${input.referenceExternalTransactionId} not found`,
          );
        }
        if (refTx.status !== WagerTransactionStatus.Processed) {
          throw new ReferenceNotFoundError(
            `Reference transaction ${input.referenceExternalTransactionId} is not processed`,
          );
        }
        referenceExternalTransactionId = input.referenceExternalTransactionId;
      }

      const txId = crypto.randomUUID();
      const payloadHash = computePayloadHash({
        idempotencyKey: input.idempotencyKey,
        providerId: input.providerId,
        externalTransactionId: input.externalTransactionId,
        playerId: input.playerId,
        walletId: input.walletId,
        roundId: input.roundId,
        gameId: input.gameId,
        kind: input.kind,
        money,
        referenceExternalTransactionId,
      });

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
