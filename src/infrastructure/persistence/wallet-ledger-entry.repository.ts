import { EntityRepository, QueryOrder } from '@mikro-orm/core';
import { WalletLedgerEntryEntity } from './wallet-ledger-entry.entity';

export interface LedgerPageResult {
  entries: WalletLedgerEntryEntity[];
  nextCursor: string | null;
  hasMore: boolean;
}

export class WalletLedgerEntryRepository extends EntityRepository<WalletLedgerEntryEntity> {
  async findByTransactionId(transactionId: string): Promise<WalletLedgerEntryEntity | null> {
    return this.findOne({ transactionId });
  }

  async findByWalletId(
    walletId: string,
    limit: number = 50,
    cursor?: string,
  ): Promise<LedgerPageResult> {
    const fetchLimit = limit + 1; // Fetch one extra to check hasMore

    const where: any = { walletId };
    if (cursor) {
      // Cursor is encoded createdAt timestamp
      const cursorDate = new Date(Buffer.from(cursor, 'base64').toString());
      where.createdAt = { $gt: cursorDate };
    }

    const entries = await this.find(where, {
      limit: fetchLimit,
      orderBy: { createdAt: QueryOrder.ASC },
    });

    let nextCursor: string | null = null;
    let hasMore = false;

    if (entries.length > limit) {
      hasMore = true;
      const lastEntry = entries.pop()!;
      nextCursor = Buffer.from(lastEntry.createdAt.toISOString()).toString('base64');
    }

    return {
      entries,
      nextCursor,
      hasMore,
    };
  }

  async findByWalletIdForReconciliation(walletId: string): Promise<WalletLedgerEntryEntity[]> {
    return this.find({ walletId }, { orderBy: { createdAt: QueryOrder.ASC } });
  }

  async persistAndFlush(entry: WalletLedgerEntryEntity): Promise<void> {
    this.em.persist(entry);
    await this.em.flush();
  }
}
