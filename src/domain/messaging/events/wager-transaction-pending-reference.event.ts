import { IntegrationEvent } from '@domain/messaging';

export interface WagerTransactionPendingReferenceData {
  transactionId: string;
  walletId: string;
  kind: string;
  referenceId: string;
}

export class WagerTransactionPendingReference extends IntegrationEvent<WagerTransactionPendingReferenceData> {
  public readonly eventType = 'WagerTransactionPendingReference';
  public readonly version = 1;
}
