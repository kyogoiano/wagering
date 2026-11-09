import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Headers,
  UseFilters,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { SubmitTransactionDto } from './dto/submit-transaction.dto';
import {
  TransactionResponseDto,
  TransactionDetailDto,
} from './dto/transaction-response.dto';
import { BusinessExceptionFilter } from '../common/filters/business-exception.filter';
import { IdempotencyKeyGuard } from '../common/guards/idempotency-key.guard';
import { TransactionService } from '@application/wager/transaction.service';
import { WagerTransactionStatus } from '@domain/transaction';
import { Roles, JungleRole } from '@auth/decorators/roles.decorator';

@Controller('wagering')
@UseFilters(BusinessExceptionFilter)
export class WageringController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post('transactions')
  @Roles(JungleRole.ADMIN, JungleRole.OPERATOR)
  @UseInterceptors(IdempotencyKeyGuard)
  async submit(
    @Body() dto: SubmitTransactionDto,
    @Headers('idempotency-key') idempotencyKey: string,
  ): Promise<TransactionResponseDto> {
    const result = await this.transactionService.submit({
      idempotencyKey,
      providerId: dto.providerId,
      externalTransactionId: dto.externalTransactionId,
      playerId: dto.playerId,
      walletId: dto.walletId,
      roundId: dto.roundId,
      gameId: dto.gameId,
      kind: dto.kind,
      moneyAmount: dto.money.amount,
      moneyCurrency: dto.money.currency,
      referenceExternalTransactionId: dto.referenceExternalTransactionId,
    });

    if (result.status === WagerTransactionStatus.Rejected) {
      throw new BadRequestException('Transaction rejected: insufficient balance');
    }

    return {
      transactionId: result.transactionId,
      status: result.status,
      balance: result.balance,
      idempotentReplay: result.idempotentReplay,
    };
  }

  @Get('transactions/:transactionId')
  @Roles(JungleRole.ADMIN, JungleRole.OPERATOR, JungleRole.READER)
  async getById(
    @Param('transactionId') transactionId: string,
  ): Promise<TransactionDetailDto> {
    const result = await this.transactionService.getById(transactionId);
    return {
      id: result.id,
      providerId: result.providerId,
      externalTransactionId: result.externalTransactionId,
      status: result.status,
      kind: result.kind,
      money: result.money,
      walletId: result.walletId,
      processedAt: result.processedAt,
    };
  }

  @Get('providers/:providerId/wagering/transactions/:externalTransactionId')
  @Roles(JungleRole.ADMIN, JungleRole.OPERATOR, JungleRole.READER)
  async getByProvider(
    @Param('providerId') providerId: string,
    @Param('externalTransactionId') externalTransactionId: string,
  ): Promise<TransactionDetailDto> {
    const result = await this.transactionService.getByProvider(
      providerId,
      externalTransactionId,
    );
    return {
      id: result.id,
      providerId: result.providerId,
      externalTransactionId: result.externalTransactionId,
      status: result.status,
      kind: result.kind,
      money: result.money,
      walletId: result.walletId,
      processedAt: result.processedAt,
    };
  }
}
