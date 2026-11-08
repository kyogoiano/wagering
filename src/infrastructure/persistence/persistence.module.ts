import { DynamicModule, Module, Global } from '@nestjs/common';
import { MikroORM, MikroORMModule } from '@mikro-orm/nestjs';
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
        MikroORMModule.forRoot({
          type: 'postgresql',
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
        MikroORMModule.forFeature([
          WalletEntity,
          WagerTransactionEntity,
          WalletLedgerEntryEntity,
          InboxMessageEntity,
          OutboxMessageEntity,
        ]),
      ],
      providers: [
        WalletRepository,
        WagerTransactionRepository,
        WalletLedgerEntryRepository,
      ],
      exports: [
        MikroORMModule,
        WalletRepository,
        WagerTransactionRepository,
        WalletLedgerEntryRepository,
      ],
    };
  }
}
