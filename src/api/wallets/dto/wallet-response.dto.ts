export class WalletResponseDto {
  id!: string;
  playerId!: string;
  balance!: { amount: string; currency: string };
  version!: number;
}

export class LedgerEntryResponseDto {
  id!: string;
  transactionId!: string;
  direction!: string;
  money!: { amount: string; currency: string };
  balanceBefore!: { amount: string; currency: string };
  balanceAfter!: { amount: string; currency: string };
  createdAt!: string;
}

export class LedgerPageResponseDto {
  entries!: LedgerEntryResponseDto[];
  nextCursor!: string | null;
  hasMore!: boolean;
}
