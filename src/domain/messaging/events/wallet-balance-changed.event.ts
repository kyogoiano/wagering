import { IntegrationEvent } from '@domain/messaging';

export interface WalletBalanceChangedData {
  walletId: string;
  balanceBefore: string;
  balanceAfter: string;
  currency: string;
  transactionId: string;
}

export class WalletBalanceChanged extends IntegrationEvent<WalletBalanceChangedData> {
  public readonly eventType = 'WalletBalanceChanged';
  public readonly version = 1;
}
