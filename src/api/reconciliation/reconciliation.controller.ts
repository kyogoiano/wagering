import { Controller, Post, Param, UseFilters } from '@nestjs/common';
import { ReconciliationResponseDto } from './dto/reconciliation-response.dto';
import { BusinessExceptionFilter } from '../common/filters/business-exception.filter';
import { ReconciliationService } from '@application/reconciliation/reconciliation.service';
import { Roles, JungleRole } from '@auth/decorators/roles.decorator';

@Controller('wallets')
@UseFilters(BusinessExceptionFilter)
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Post(':walletId/reconciliation')
  @Roles(JungleRole.ADMIN, JungleRole.OPERATOR)
  async reconcile(
    @Param('walletId') walletId: string,
  ): Promise<ReconciliationResponseDto> {
    const result = await this.reconciliationService.reconcile(walletId);
    return {
      walletId: result.walletId,
      storedBalance: result.storedBalance,
      calculatedBalance: result.calculatedBalance,
      difference: result.difference,
      consistent: result.consistent,
      checkedEntries: result.checkedEntries,
    };
  }
}
