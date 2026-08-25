// src/bootstraps/api/api.module.ts
import { GraphQLAdapterModule } from '@src/adapters/api/graphql/graphql-adapter.module';
import { CapabilityModule } from '@src/infrastructure/capability/capability.module';
import { AppConfigModule } from '@src/infrastructure/config/config.module';
import { DatabaseModule } from '@src/infrastructure/database/database.module';
import { TypeOrmTransactionModule } from '@src/infrastructure/database/transaction/typeorm-transaction.module';
import { FieldEncryptionModule } from '@src/infrastructure/field-encryption/field-encryption.module';
import { GqlAllExceptionsFilter } from '@src/infrastructure/graphql/filters/graphql-exception.filter';
import { AppGraphQLModule } from '@src/infrastructure/graphql/graphql.module';
import { LoggerModule } from '@src/infrastructure/logger/logger.module';
import { MiddlewareModule } from '@src/infrastructure/middleware/middleware.module';
import { AccountModule } from '@src/modules/account/account.module';
import { AuthModule } from '@src/modules/auth/auth.module';
import { PasswordModule } from '@src/modules/common/password/password.module';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ApiController } from './api.controller';
import { ApiService } from './api.service';

@Module({
  imports: [
    AppConfigModule,
    CapabilityModule.forRoot({ process: 'api' }),
    LoggerModule,
    MiddlewareModule,
    DatabaseModule,
    TypeOrmTransactionModule,
    AppGraphQLModule,
    GraphQLAdapterModule,
    FieldEncryptionModule,
    PasswordModule,
    AccountModule,
    AuthModule,
  ],
  controllers: [ApiController],
  providers: [
    ApiService,
    {
      provide: APP_FILTER,
      useClass: GqlAllExceptionsFilter,
    },
  ],
})
export class ApiModule {}
