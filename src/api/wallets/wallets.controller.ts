import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseFilters,

} from '@nestjs/common';
import { CreateWalletDto } from './dto/create-wallet.dto';
import {
  WalletResponseDto,
  LedgerPageResponseDto,
} from './dto/wallet-response.dto';
import { BusinessExceptionFilter } from '../common/filters/business-exception.filter';
import { Money } from '@domain/money';
import { Wallet } from '@domain/wallet';

@Controller('wallets')
@UseFilters(BusinessExceptionFilter)
export class WalletsController {
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateWalletDto): Promise<WalletResponseDto> {
    // Placeholder — will be wired to use case once persistence is ready
    const initialBalance = Money.from({
      amount: dto.initialBalance.amount,
      currency: dto.initialBalance.currency,
    });

    const wallet = Wallet.open({
      id: crypto.randomUUID(),
      playerId: dto.playerId,
      initialBalance,
    });

    const state = wallet.toJSON();
    return {
      id: state.id,
      playerId: state.playerId,
      balance: { amount: state.balanceAmount, currency: state.currency },
      version: state.version,
    };
  }

  @Get(':walletId')
  async getById(@Param('walletId') walletId: string): Promise<WalletResponseDto> {
    // Placeholder — will query database
    return {
      id: walletId,
      playerId: '',
      balance: { amount: '0.00', currency: 'BRL' },
      version: 0,
    };
  }

  @Get(':walletId/ledger')
  async getLedger(
    @Param('walletId') walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<LedgerPageResponseDto> {
    const pageLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    // Placeholder — will query database with cursor pagination
    return {
      entries: [],
      nextCursor: null,
      hasMore: false,
    };
  }
}
