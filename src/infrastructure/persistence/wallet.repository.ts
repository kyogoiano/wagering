import { EntityRepository, LockMode } from '@mikro-orm/core';
import { WalletEntity } from './wallet.entity';

export class WalletRepository extends EntityRepository<WalletEntity> {
  async findByPlayerId(playerId: string, currency: string): Promise<WalletEntity | null> {
    return this.findOne({ playerId, currency });
  }

  async findById(walletId: string): Promise<WalletEntity | null> {
    return this.findOne({ id: walletId });
  }

  async findOneForUpdate(walletId: string): Promise<WalletEntity | null> {
    return this.findOne({ id: walletId }, { lockMode: LockMode.PESSIMISTIC_WRITE });
  }

  async persistAndFlush(wallet: WalletEntity): Promise<void> {
    this.em.persist(wallet);
    await this.em.flush();
  }

  async update(wallet: WalletEntity): Promise<void> {
    this.em.persist(wallet);
    await this.em.flush();
  }

  async findLedgerEntries(
    walletId: string,
    limit: number = 50,
    cursor?: string,
  ): Promise<{ entries: WalletEntity[]; nextCursor: string | null; hasMore: boolean }> {
    // This will be handled by WalletLedgerEntryRepository
    return { entries: [], nextCursor: null, hasMore: false };
  }
}
