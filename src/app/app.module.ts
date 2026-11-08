import { Module } from '@nestjs/common';
import { MikroORMModule } from '@mikro-orm/nestjs';
import { WalletsModule } from './wallets/wallets.module';
import { ormConfig } from '@infrastructure/config/orm.config';

@Module({
  imports: [MikroORMModule.forRoot(ormConfig), WalletsModule],
})
export class AppModule {}
