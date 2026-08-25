// src/usecases/account/fetch-user-info.usecase.ts

import type { PersistenceTransactionContext } from '@app-types/common/transaction.types';
import type { IdentityTypeEnum } from '@app-types/models/account.types';
import { UserInfoView } from '@app-types/models/auth.types'; // 导入统一的 UserInfoView
import { UserState } from '@app-types/models/user-info.types';
import { ACCOUNT_ERROR, DomainError } from '@core/common/errors';
import { AccountSecurityService } from '@modules/account/base/services/account-security.service';
import { AccountQueryService } from '@modules/account/queries/account.query.service';
import { Injectable } from '@nestjs/common';
import type { CompleteUserData } from './fetch-user-info.types';

// 移除本地的 UserInfoView 定义，使用统一的类型定义

@Injectable()
export class FetchUserInfoUsecase {
  constructor(
    private readonly accountQueryService: AccountQueryService,
    private readonly accountSecurityService: AccountSecurityService,
  ) {}

  /**
   * 登录场景：允许 user_info 不存在，提供兜底值
   * - accessGroup 可选：外部若已计算可透传；未提供则在本用例内计算（避免多真相源）
   */
  // 移除 executeStrict 方法，因为 UserInfoView 现在本身就是严格类型
  // async executeStrict(...) 方法可以删除

  /**
   * 获取用户信息（登录专用）
   * 确保返回完整的用户信息，所有必要字段都有值
   */
  async executeForLogin(params: {
    accountId: number;
    accessGroup?: IdentityTypeEnum[];
  }): Promise<UserInfoView> {
    return await this.accountQueryService.getUserInfoViewForLogin({
      accountId: params.accountId,
    });
  }

  /**
   * 严格模式：必须存在 user_info，否则抛错
   * - 适用于资料管理页等强一致场景
   * - accessGroup 可选：同上
   */
  async executeStrict(params: {
    accountId: number;
    accessGroup?: IdentityTypeEnum[];
    transactionContext?: PersistenceTransactionContext;
  }): Promise<
    UserInfoView & {
      nickname: string;
      userState: UserState;
      notifyCount: number;
      unreadCount: number;
      createdAt: Date;
      updatedAt: Date;
    }
  > {
    const { accountId } = params;

    return await this.accountQueryService.getUserInfoViewStrict({
      accountId,
      transactionContext: params.transactionContext,
    });
  }

  /**
   * 登录流程专用：获取完整用户数据并执行安全验证
   * - 包含 metaDigest 与 accessGroup 的一致性检查
   * - 返回验证后的真实 accessGroup
   * - 用于三步登录流程的统一数据获取
   */
  async executeForLoginFlow(params: { accountId: number }): Promise<CompleteUserData> {
    const { accountId } = params;

    // 1. 获取登录安全快照
    const loginSnapshot = await this.accountQueryService.getLoginBootstrapSnapshot({ accountId });

    // 2. 执行安全验证（metaDigest 与 accessGroup 比对）
    const securityResult = this.accountSecurityService.checkAndHandleAccountSecurity({
      id: loginSnapshot.account.id,
      userInfo: loginSnapshot.userInfo,
    });

    // 3. 如果账号被暂停，抛出错误
    if (securityResult.wasSuspended) {
      throw new DomainError(ACCOUNT_ERROR.ACCOUNT_SUSPENDED, '账户因安全问题已被暂停');
    }

    // 4. 构建用户信息视图
    const userInfoView = await this.accountQueryService.getUserInfoViewStrict({ accountId });

    return {
      userInfoView,
      securityResult,
    };
  }
}
export { UserInfoView };
