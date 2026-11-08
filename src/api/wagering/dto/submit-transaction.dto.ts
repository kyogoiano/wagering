import { IsUUID, IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { MoneyDto } from '@api/wallets/dto/create-wallet.dto';
import { WagerTransactionKind } from '@domain/transaction';

export class SubmitTransactionDto {
  @IsString()
  @IsNotEmpty()
  providerId!: string;

  @IsString()
  @IsNotEmpty()
  externalTransactionId!: string;

  @IsUUID('4')
  playerId!: string;

  @IsUUID('4')
  walletId!: string;

  @IsString()
  @IsNotEmpty()
  roundId!: string;

  @IsString()
  @IsNotEmpty()
  gameId!: string;

  @IsIn(Object.values(WagerTransactionKind))
  kind!: WagerTransactionKind;

  @Type(() => MoneyDto)
  money!: MoneyDto;

  @IsString()
  @IsOptional()
  referenceExternalTransactionId?: string;
}
