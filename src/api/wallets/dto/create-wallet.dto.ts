import { IsUUID, IsString, IsNotEmpty, ValidateIf, IsObject } from 'class-validator';
import { Type } from 'class-transformer';

export class MoneyDto {
  @IsString()
  @IsNotEmpty()
  amount!: string;

  @IsString()
  @IsNotEmpty()
  @ValidateIf((o, v) => v !== undefined)
  currency!: string;
}

export class CreateWalletDto {
  @IsUUID('4')
  playerId!: string;

  @IsObject()
  @Type(() => MoneyDto)
  initialBalance!: MoneyDto;
}
