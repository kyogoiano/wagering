import { Module } from '@nestjs/common';
import { WageringController } from './wagering.controller';
import { TransactionService } from '@application/wager/transaction.service';

@Module({
  controllers: [WageringController],
  providers: [TransactionService],
})
export class WageringModule {}
