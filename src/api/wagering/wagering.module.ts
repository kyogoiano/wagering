import { Module } from '@nestjs/common';
import { WageringController } from './wagering.controller';
import { TransactionService } from '@application/wager/transaction.service';
import { IdempotencyService } from '@application/idempotency/idempotency.service';

@Module({
  controllers: [WageringController],
  providers: [TransactionService, IdempotencyService],
})
export class WageringModule {}
