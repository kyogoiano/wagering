import { Module } from '@nestjs/common';
import { WageringController } from './wagering.controller';

@Module({
  controllers: [WageringController],
})
export class WageringModule {}
