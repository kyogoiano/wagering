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
import { WalletService } from '@application/wallet/wallet.service';
import { Roles } from '@auth/decorators/roles.decorator';
import { JungleRole } from '@auth/decorators/roles.decorator';

@Controller('wallets')
@UseFilters(BusinessExceptionFilter)
export class WalletsController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @Roles(JungleRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateWalletDto): Promise<WalletResponseDto> {
    const initialBalance = Money.from({
      amount: dto.initialBalance.amount,
      currency: dto.initialBalance.currency,
    });

    const result = await this.walletService.create({
      playerId: dto.playerId,
      initialBalance,
    });

    return {
      id: result.id,
      playerId: result.playerId,
      balance: result.balance,
      version: result.version,
    };
  }

  @Get(':walletId')
  @Roles(JungleRole.ADMIN, JungleRole.OPERATOR, JungleRole.READER)
  async getById(@Param('walletId') walletId: string): Promise<WalletResponseDto> {
    const result = await this.walletService.getById(walletId);
    return {
      id: result.id,
      playerId: result.playerId,
      balance: result.balance,
      version: result.version,
    };
  }

  @Get(':walletId/ledger')
  @Roles(JungleRole.ADMIN, JungleRole.OPERATOR, JungleRole.READER)
  async getLedger(
    @Param('walletId') walletId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<LedgerPageResponseDto> {
    const pageLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const result = await this.walletService.getLedger(walletId, pageLimit, cursor);
    return {
      entries: result.entries,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }
}
