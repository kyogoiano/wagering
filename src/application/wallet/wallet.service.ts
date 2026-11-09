import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { WalletRepository } from '@infrastructure/persistence/wallet.repository';
import { WagerTransactionRepository } from '@infrastructure/persistence/wager-transaction.repository';
import { WalletLedgerEntryRepository } from '@infrastructure/persistence/wallet-ledger-entry.repository';
import { Money } from '@domain/money';
import { Wallet } from '@domain/wallet';
import {
  WagerTransactionStatus,
} from '@domain/transaction';
import { WalletLedgerEntry, LedgerDirection } from '@domain/ledger';
import { WalletNotFoundError, WalletAlreadyExistsError } from '@domain/errors/domain.error';

export interface CreateWalletInput {
  playerId: string;
  initialBalance: Money;
}

export interface CreateWalletOutput {
  id: string;
  playerId: string;
  balance: { amount: string; currency: string };
  version: number;
}

export interface WalletDetailOutput {
  id: string;
  playerId: string;
  balance: { amount: string; currency: string };
  version: number;
}

export interface LedgerEntryOutput {
  id: string;
  transactionId: string;
  direction: string;
  money: { amount: string; currency: string };
  balanceBefore: { amount: string; currency: string };
  balanceAfter: { amount: string; currency: string };
  createdAt: string;
}

export interface LedgerPageOutput {
  entries: LedgerEntryOutput[];
  nextCursor: string | null;
  hasMore: boolean;
}

@Injectable()
export class WalletService {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly transactionRepository: WagerTransactionRepository,
    private readonly ledgerRepository: WalletLedgerEntryRepository,
    private readonly em: EntityManager,
  ) {}

  async create(input: CreateWalletInput): Promise<CreateWalletOutput> {
    const existing = await this.walletRepository.findByPlayerId(
      input.playerId,
      input.initialBalance.currency,
    );
    if (existing) {
      throw new WalletAlreadyExistsError(
        `Wallet already exists for player ${input.playerId} with currency ${input.initialBalance.currency}`,
      );
    }

    const walletId = crypto.randomUUID();
    const wallet = Wallet.open({
      id: walletId,
      playerId: input.playerId,
      initialBalance: input.initialBalance,
    });

    const state = wallet.toJSON();

    // Persist wallet entity
    const walletEntity = this.em.create('WalletEntity', {
      id: walletId,
      playerId: input.playerId,
      currency: state.currency,
      balanceAmount: state.balanceAmount,
      version: state.version,
    });

    await this.walletRepository.create(walletEntity);

    // If there's an opening balance, create OPENING transaction and ledger entry
    if (input.initialBalance.isGreaterThan(Money.from({ amount: '0', currency: input.initialBalance.currency }))) {
      const txId = crypto.randomUUID();
      const txEntity = this.em.create('WagerTransactionEntity', {
        id: txId,
        providerId: 'system',
        externalTransactionId: `opening-${walletId}`,
        idempotencyKey: `opening-${walletId}`,
        payloadHash: 'opening',
        walletId,
        playerId: input.playerId,
        roundId: 'system',
        gameId: 'system',
        kind: 'OPENING',
        moneyAmount: state.balanceAmount,
        moneyCurrency: state.currency,
        status: WagerTransactionStatus.Processed,
        processedAt: new Date(),
      });
      await this.transactionRepository.create(txEntity);

      const ledgerEntry = WalletLedgerEntry.create({
        id: crypto.randomUUID(),
        walletId,
        transactionId: txId,
        direction: LedgerDirection.Credit,
        amount: input.initialBalance.amount,
        currency: input.initialBalance.currency,
        balanceBefore: '0',
        balanceAfter: input.initialBalance.amount,
      });
      const ledgerState = ledgerEntry.toJSON();

      const ledgerEntity = this.em.create('WalletLedgerEntryEntity', {
        id: ledgerState.id,
        walletId,
        transactionId: txId,
        direction: ledgerState.direction,
        amount: ledgerState.amount,
        currency: ledgerState.currency,
        balanceBefore: ledgerState.balanceBefore,
        balanceAfter: ledgerState.balanceAfter,
      });
      await this.ledgerRepository.create(ledgerEntity);
    }

    await this.em.flush();

    return {
      id: state.id,
      playerId: state.playerId,
      balance: { amount: state.balanceAmount, currency: state.currency },
      version: state.version,
    };
  }

  async getById(walletId: string): Promise<WalletDetailOutput> {
    const walletEntity = await this.walletRepository.findById(walletId);
    if (!walletEntity) {
      throw new WalletNotFoundError(`Wallet ${walletId} not found`);
    }

    return {
      id: walletEntity.id,
      playerId: walletEntity.playerId,
      balance: { amount: walletEntity.balanceAmount, currency: walletEntity.currency },
      version: walletEntity.version,
    };
  }

  async getLedger(
    walletId: string,
    limit: number = 50,
    cursor?: string,
  ): Promise<LedgerPageOutput> {
    // Verify wallet exists
    const walletEntity = await this.walletRepository.findById(walletId);
    if (!walletEntity) {
      throw new WalletNotFoundError(`Wallet ${walletId} not found`);
    }

    const result = await this.ledgerRepository.findByWalletId(walletId, limit, cursor);

    const entries: LedgerEntryOutput[] = result.entries.map((entry) => ({
      id: entry.id,
      transactionId: entry.transactionId,
      direction: entry.direction,
      money: { amount: entry.amount, currency: entry.currency },
      balanceBefore: { amount: entry.balanceBefore, currency: entry.currency },
      balanceAfter: { amount: entry.balanceAfter, currency: entry.currency },
      createdAt: entry.createdAt.toISOString(),
    }));

    return {
      entries,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }
}
