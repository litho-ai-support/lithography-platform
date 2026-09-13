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
import { SearchModule } from '@src/modules/common/search.module';

import { AccountFieldEncryptionRegistrar } from './account-field-encryption.registrar';
import { IdentityAccountCapabilityAnchor } from './account.capability';
import { AccountEntity } from './base/entities/account.entity';
import { UserInfoEntity } from './base/entities/user-info.entity';
import { AccountSecurityService } from './base/services/account-security.service';
import { AccountService } from './base/services/account.service';
import { AccountQueryService } from './queries/account.query.service';
import { AdminUserQueryService } from './queries/admin-user.query.service';

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
        // 管理员用户列表复用共享搜索管线（LIKE 参数化转义 + OFFSET 分页 + COUNT）。
        // `queryservice.rules.md` 第 23 行（QueryService 归属 modules(service)）
        // + `modules.rules.md` 第 75 行（允许业务域 modules(service) → modules/common/*）
        // + eslint boundaries `modules-queries` allow `modules-internal{moduleScope:'common'}`
        SearchModule,
      ],
      providers: [
        IdentityAccountCapabilityAnchor,
        AccountFieldEncryptionRegistrar,
        AccountService,
        AccountQueryService,
        AdminUserQueryService,
        AccountSecurityService,
      ],
      exports: [
        TypeOrmModule,
        AccountService,
        AccountQueryService,
        AdminUserQueryService,
        AccountSecurityService,
      ],
    };
  }
}
