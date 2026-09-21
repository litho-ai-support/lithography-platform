// src/bootstraps/api/api.module.ts
import { GraphQLAdapterModule } from '@src/adapters/api/graphql/graphql-adapter.module';
import { RestAdapterModule } from '@src/adapters/api/rest/rest-adapter.module';
import { CapabilityModule } from '@src/infrastructure/capability/capability.module';
import { AppConfigModule } from '@src/infrastructure/config/config.module';
import { DatabaseModule } from '@src/infrastructure/database/database.module';
import { TypeOrmTransactionModule } from '@src/infrastructure/database/transaction/typeorm-transaction.module';
import { FieldEncryptionModule } from '@src/infrastructure/field-encryption/field-encryption.module';
import { LocalReferenceDocumentStorageModule } from '@src/infrastructure/file-storage/local-reference-document-storage.module';
import { GqlAllExceptionsFilter } from '@src/infrastructure/graphql/filters/graphql-exception.filter';
import { AppGraphQLModule } from '@src/infrastructure/graphql/graphql.module';
import { LoggerModule } from '@src/infrastructure/logger/logger.module';
import { MiddlewareModule } from '@src/infrastructure/middleware/middleware.module';
import { AccountModule } from '@src/modules/account/account.module';
import { AuthModule } from '@src/modules/auth/auth.module';
import { PasswordModule } from '@src/modules/common/password/password.module';
import { LithographyModule } from '@src/modules/lithography/lithography.module';
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
    LocalReferenceDocumentStorageModule,
    AppGraphQLModule,
    GraphQLAdapterModule,
    RestAdapterModule,
    FieldEncryptionModule,
    PasswordModule,
    AccountModule,
    AuthModule,
    LithographyModule,
  ],
  controllers: [ApiController],
  providers: [
    ApiService,
    // 全局异常过滤器以类为 token 注册为具名 provider，再由 APP_FILTER useExisting
    // 别名引用：E2E override GqlAllExceptionsFilter 时改的就是实际生效的那个实例，
    // 不会出现「override 命中的是别名而真实过滤器仍走默认装配」的测试假阳性。
    GqlAllExceptionsFilter,
    {
      provide: APP_FILTER,
      useExisting: GqlAllExceptionsFilter,
    },
  ],
})
export class ApiModule {}
