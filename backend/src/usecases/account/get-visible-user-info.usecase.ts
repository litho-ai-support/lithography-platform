// 文件位置：src/usecases/account/get-visible-user-info.usecase.ts
import { IdentityTypeEnum } from '@app-types/models/account.types';
import { UserInfoView } from '@app-types/models/auth.types';
import { hasRole } from '@core/account/policy/role-access.policy';
import { canViewUserInfo } from '@core/account/policy/user-info-visibility.policy';
import { DomainError, PERMISSION_ERROR } from '@core/common/errors/domain-error';
import { Injectable } from '@nestjs/common';
import { UsecaseSession } from '@app-types/auth/session.types';
import { FetchUserInfoUsecase } from './fetch-user-info.usecase';

export type VisibleDetailMode = 'BASIC' | 'FULL';

@Injectable()
export class GetVisibleUserInfoUsecase {
  constructor(private readonly fetchUserInfoUsecase: FetchUserInfoUsecase) {}

  /**
   * 执行按可见性读取用户信息
   * - 角色策略：
   *   - ADMIN：可查看所有人的用户信息
   *   - STAFF：可查看其他账户的用户信息
   *   - GUEST / REGISTRANT：仅可查看自己
   * - 读取实现：统一通过 Account 域的 UserInfo 读取，保持与账户绑定
   * - 按需反馈：支持 'BASIC' 与 'FULL' 两种详情级别
   */
  async execute(params: {
    session: UsecaseSession;
    targetAccountId: number;
    detail?: VisibleDetailMode;
  }): Promise<UserInfoView> {
    const { session, targetAccountId } = params;
    const detail: VisibleDetailMode = params.detail ?? 'FULL';

    if (!Number.isInteger(targetAccountId) || targetAccountId <= 0) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '非法的目标账户 ID');
    }

    const allowed = this.isAllowedToView(session, targetAccountId);
    if (!allowed) {
      throw new DomainError(PERMISSION_ERROR.ACCESS_DENIED, '无权限查看该用户信息');
    }

    const view = await this.fetchUserInfoUsecase.executeStrict({ accountId: targetAccountId });

    if (detail === 'BASIC') {
      return this.maskToBasic(view);
    }
    return view;
  }

  /**
   * 角色可见性策略判定
   */
  private isAllowedToView(session: UsecaseSession, targetAccountId: number): boolean {
    const isSelf = session.accountId === targetAccountId;
    if (isSelf) return true;
    if (hasRole(session.roles, IdentityTypeEnum.ADMIN)) return true;
    return canViewUserInfo(session.roles, { isSelf });
  }

  /**
   * 按需反馈：将完整视图收敛为基础字段视图
   */
  private maskToBasic(view: UserInfoView): UserInfoView {
    return {
      accountId: view.accountId,
      nickname: view.nickname,
      gender: view.gender,
      birthDate: view.birthDate,
      avatarUrl: view.avatarUrl,
      email: null,
      signature: null,
      accessGroup: view.accessGroup,
      address: null,
      phone: view.phone,
      tags: null,
      geographic: null,
      metaDigest: null,
      notifyCount: 0,
      unreadCount: 0,
      userState: view.userState,
      createdAt: view.createdAt,
      updatedAt: view.updatedAt,
    };
  }
}
