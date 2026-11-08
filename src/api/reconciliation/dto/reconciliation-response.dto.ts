export class ReconciliationResponseDto {
  walletId!: string;
  storedBalance!: { amount: string; currency: string };
  calculatedBalance!: { amount: string; currency: string };
  difference!: { amount: string; currency: string };
  consistent!: boolean;
  checkedEntries!: number;
}
