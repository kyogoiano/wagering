import { Injectable } from '@nestjs/common';
import { WalletRepository } from '@infrastructure/persistence/wallet.repository';
import { WalletLedgerEntryRepository } from '@infrastructure/persistence/wallet-ledger-entry.repository';
import { Money } from '@domain/money';
import { WalletNotFoundError } from '@domain/errors/domain.error';

export interface ReconciliationOutput {
  walletId: string;
  storedBalance: { amount: string; currency: string };
  calculatedBalance: { amount: string; currency: string };
  difference: { amount: string; currency: string };
  consistent: boolean;
  checkedEntries: number;
}

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly walletRepository: WalletRepository,
    private readonly ledgerRepository: WalletLedgerEntryRepository,
  ) {}

  async reconcile(walletId: string): Promise<ReconciliationOutput> {
    const walletEntity = await this.walletRepository.findById(walletId);
    if (!walletEntity) {
      throw new WalletNotFoundError(`Wallet ${walletId} not found`);
    }

    const storedBalance = Money.from({
      amount: walletEntity.balanceAmount,
      currency: walletEntity.currency,
    });

    const ledgerEntries = await this.ledgerRepository.findByWalletIdForReconciliation(walletId);

    // Calculate balance from ledger entries
    let calculatedBalance = Money.from({ amount: '0', currency: walletEntity.currency });
    for (const entry of ledgerEntries) {
      const entryMoney = Money.from({ amount: entry.amount, currency: entry.currency });
      if (entry.direction === 'CREDIT') {
        calculatedBalance = calculatedBalance.add(entryMoney);
      } else if (entry.direction === 'DEBIT') {
        calculatedBalance = calculatedBalance.subtract(entryMoney);
      }
    }

    const difference = storedBalance.subtract(calculatedBalance);
    const consistent = difference.equals(Money.from({ amount: '0', currency: walletEntity.currency }));

    return {
      walletId,
      storedBalance: { amount: storedBalance.amount, currency: storedBalance.currency },
      calculatedBalance: { amount: calculatedBalance.amount, currency: calculatedBalance.currency },
      difference: { amount: difference.amount, currency: difference.currency },
      consistent,
      checkedEntries: ledgerEntries.length,
    };
  }
}
