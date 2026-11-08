import { IntegrationEvent } from '@domain/messaging';

export interface WagerTransactionProcessedData {
  transactionId: string;
  walletId: string;
  kind: string;
  status: string;
  amount: string;
  currency: string;
}

export class WagerTransactionProcessed extends IntegrationEvent<WagerTransactionProcessedData> {
  public readonly eventType = 'WagerTransactionProcessed';
  public readonly version = 1;
}
