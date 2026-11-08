import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { SubmitTransactionDto } from './dto/submit-transaction.dto';
import {
  TransactionResponseDto,
  TransactionDetailDto,
} from './dto/transaction-response.dto';
import { BusinessExceptionFilter } from '../common/filters/business-exception.filter';
import { IdempotencyKeyGuard } from '../common/guards/idempotency-key.guard';

@Controller('wagering')
@UseFilters(BusinessExceptionFilter)
export class WageringController {
  @Post('transactions')
  @UseInterceptors(IdempotencyKeyGuard)
  async submit(
    @Body() dto: SubmitTransactionDto,
    @Headers('idempotency-key') _idempotencyKey: string,
  ): Promise<TransactionResponseDto> {
    // Placeholder — will be wired to use case
    return {
      transactionId: crypto.randomUUID(),
      status: 'PROCESSED',
      balance: { amount: '0.00', currency: dto.money.currency },
      idempotentReplay: false,
    };
  }

  @Get('transactions/:transactionId')
  async getById(
    @Param('transactionId') transactionId: string,
  ): Promise<TransactionDetailDto> {
    // Placeholder — will query database
    return {
      id: transactionId,
      providerId: '',
      externalTransactionId: '',
      status: 'PROCESSED',
      kind: 'BET',
      money: { amount: '0.00', currency: 'BRL' },
      walletId: '',
    };
  }

  @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
  async getByProvider(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ): Promise<TransactionDetailDto> {
    // Placeholder — will query database
    return {
      id: '',
      providerId,
      externalTransactionId,
      status: 'PROCESSED',
      kind: 'BET',
      money: { amount: '0.00', currency: 'BRL' },
      walletId: '',
    };
  }
}
