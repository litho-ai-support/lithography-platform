// src/modules/account/account-installer.module.ts
import { Module, Provider } from '@nestjs/common';
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { AccountModule } from './account.module';

/** 可注入的配置 Token（使用 Symbol 避免字符串冲突） */
export const IDENTITY_PRIORITY_TOKEN = Symbol('IDENTITY_PRIORITY_TOKEN');

/** 通用账号角色优先级（不再承载业务身份包优先级） */
export const DEFAULT_IDENTITY_PRIORITY = {
  fallback: [
    IdentityTypeEnum.ADMIN,
    IdentityTypeEnum.STAFF,
    IdentityTypeEnum.GUEST,
    IdentityTypeEnum.REGISTRANT,
  ],
  hintAutoPromote: false,
  hintAutoPromoteOnReactivate: false,
} as const;

/** 通过值推导的类型 */
export type IdentityPriorityConfig = typeof DEFAULT_IDENTITY_PRIORITY;

/** 从常量推导的身份键类型（避免手写联合类型） */
export type IdentityKey = (typeof DEFAULT_IDENTITY_PRIORITY.fallback)[number];

// eslint-disable-next-line @typescript-eslint/naming-convention
const IdentityPriorityProvider: Provider = {
  provide: IDENTITY_PRIORITY_TOKEN,
  useValue: DEFAULT_IDENTITY_PRIORITY,
};

/**
 * 账户安装器模块（非全局）
 * - 只在这里调用一次 AccountModule.forRoot() 完成账号 base 装配
 * - 通过 re-export，让下游模块都能拿到 AccountModule 的导出（AccountService 等）
 * - 提供通用账号角色优先级配置，可通过 IDENTITY_PRIORITY_TOKEN 注入使用
 */
@Module({
  imports: [AccountModule.forRoot()],
  providers: [IdentityPriorityProvider],
  // 关键点：直接导出 AccountModule，本模块的下游即可获得它导出的账号 base provider
  exports: [AccountModule, IdentityPriorityProvider],
})
export class AccountInstallerModule {}

/*
用法示例（任意 Service 内）：
import { Inject, Injectable } from '@nestjs/common';
@Injectable()
class IdentityHintUpdater {
  constructor(
    @Inject(IDENTITY_PRIORITY_TOKEN)
    private readonly priority: IdentityPriorityConfig,
  ) {}
  // this.priority.fallback 可直接使用
}
*/
