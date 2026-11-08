export class TransactionResponseDto {
  transactionId!: string;
  status!: string;
  balance!: { amount: string; currency: string };
  idempotentReplay!: boolean;
}

export class TransactionDetailDto {
  id!: string;
  providerId!: string;
  externalTransactionId!: string;
  status!: string;
  kind!: string;
  money!: { amount: string; currency: string };
  walletId!: string;
  processedAt?: string;
}
