import { Module } from '@nestjs/common';
import { WalletsController } from './wallets.controller';
import { WalletService } from '@application/wallet/wallet.service';

@Module({
  controllers: [WalletsController],
  providers: [WalletService],
})
export class WalletsModule {}
