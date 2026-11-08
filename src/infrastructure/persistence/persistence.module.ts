import { DynamicModule, Module, Global, OnModuleInit } from '@nestjs/common';
import { MikroOrmModule, getRepositoryToken } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { WalletEntity } from './wallet.entity';
import { WagerTransactionEntity } from './wager-transaction.entity';
import { WalletLedgerEntryEntity } from './wallet-ledger-entry.entity';
import { InboxMessageEntity } from './inbox-message.entity';
import { OutboxMessageEntity } from './outbox-message.entity';
import { WalletRepository } from './wallet.repository';
import { WagerTransactionRepository } from './wager-transaction.repository';
import { WalletLedgerEntryRepository } from './wallet-ledger-entry.repository';

@Global()
@Module({})
export class PersistenceModule {
  static forRoot(): DynamicModule {
    return {
      module: PersistenceModule,
      imports: [
        MikroOrmModule.forRoot({
          driver: PostgreSqlDriver,
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432', 10),
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'postgres',
          dbName: process.env.DB_NAME || 'jungle',
          entities: [
            WalletEntity,
            WagerTransactionEntity,
            WalletLedgerEntryEntity,
            InboxMessageEntity,
            OutboxMessageEntity,
          ],
          debug: process.env.NODE_ENV !== 'production',
        }),
        MikroOrmModule.forFeature([
          WalletEntity,
          WagerTransactionEntity,
          WalletLedgerEntryEntity,
          InboxMessageEntity,
          OutboxMessageEntity,
        ]),
      ],
      providers: [
        {
          provide: WalletRepository,
          useFactory: (repo: any) => {
            const custom = Object.create(WalletRepository.prototype);
            Object.assign(custom, repo);
            return custom;
          },
          inject: [getRepositoryToken(WalletEntity)],
        },
        {
          provide: WagerTransactionRepository,
          useFactory: (repo: any) => {
            const custom = Object.create(WagerTransactionRepository.prototype);
            Object.assign(custom, repo);
            return custom;
          },
          inject: [getRepositoryToken(WagerTransactionEntity)],
        },
        {
          provide: WalletLedgerEntryRepository,
          useFactory: (repo: any) => {
            const custom = Object.create(WalletLedgerEntryRepository.prototype);
            Object.assign(custom, repo);
            return custom;
          },
          inject: [getRepositoryToken(WalletLedgerEntryEntity)],
        },
      ],
      exports: [MikroOrmModule, WalletRepository, WagerTransactionRepository, WalletLedgerEntryRepository],
    };
  }
}
