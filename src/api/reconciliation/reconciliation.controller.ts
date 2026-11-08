import { Controller, Post, Param, UseFilters } from '@nestjs/common';
import { ReconciliationResponseDto } from './dto/reconciliation-response.dto';
import { BusinessExceptionFilter } from '../common/filters/business-exception.filter';

@Controller('wallets')
@UseFilters(BusinessExceptionFilter)
export class ReconciliationController {
  @Post(':walletId/reconciliation')
  async reconcile(
    @Param('walletId') walletId: string,
  ): Promise<ReconciliationResponseDto> {
    // Placeholder — will calculate from ledger entries
    return {
      walletId,
      storedBalance: { amount: '0.00', currency: 'BRL' },
      calculatedBalance: { amount: '0.00', currency: 'BRL' },
      difference: { amount: '0.00', currency: 'BRL' },
      consistent: true,
      checkedEntries: 0,
    };
  }
}
