// src/modules/account/account.module.ts
/**
 * AccountModule（账号 base 装配）
 * ------------------------------------------------------------
 * - base 永远启用
 * - 不再通过账号 base 装配业务 identity 包
 */

import { DynamicModule, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FieldEncryptionModule } from '@src/infrastructure/field-encryption/field-encryption.module';

import { AccountFieldEncryptionRegistrar } from './account-field-encryption.registrar';
import { IdentityAccountCapabilityAnchor } from './account.capability';
import { AccountEntity } from './base/entities/account.entity';
import { UserInfoEntity } from './base/entities/user-info.entity';
import { AccountSecurityService } from './base/services/account-security.service';
import { AccountService } from './base/services/account.service';
import { AccountQueryService } from './queries/account.query.service';

@Module({})
export class AccountModule {
  /**
   * 动态账户模块，当前仅启用账号 base。
   */
  static forRoot(): DynamicModule {
    return {
      module: AccountModule,
      imports: [
        TypeOrmModule.forFeature([AccountEntity, UserInfoEntity]), // base 实体
        FieldEncryptionModule,
      ],
      providers: [
        IdentityAccountCapabilityAnchor,
        AccountFieldEncryptionRegistrar,
        AccountService,
        AccountQueryService,
        AccountSecurityService,
      ],
      exports: [TypeOrmModule, AccountService, AccountQueryService, AccountSecurityService],
    };
  }
}
