import { IntegrationEvent } from '@domain/messaging';

export interface WagerTransactionRejectedData {
  transactionId: string;
  walletId: string;
  kind: string;
  reason: string;
  failureCode: string;
}

export class WagerTransactionRejected extends IntegrationEvent<WagerTransactionRejectedData> {
  public readonly eventType = 'WagerTransactionRejected';
  public readonly version = 1;
}
