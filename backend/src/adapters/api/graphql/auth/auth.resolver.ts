// src/adapters/api/graphql/auth/auth.resolver.ts

import { AuthLoginModel, LoginResultModel, UserInfoView } from '@app-types/models/auth.types';
import { GeographicInfo } from '@app-types/models/user-info.types';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { FetchUserInfoUsecase } from '@usecases/account/fetch-user-info.usecase';
import type { CompleteUserData } from '@usecases/account/fetch-user-info.types';
import { LoginWithPasswordUsecase } from '@usecases/auth/login-with-password.usecase';
import { LoginResult } from '../account/dto/login-result.dto';
import { UserInfoDTO } from '../account/dto/user-info.dto';
import { AuthLoginInput } from './dto/auth-login.input';

/**
 * 认证相关的 GraphQL Resolver
 */
@Resolver()
export class AuthResolver {
  constructor(
    private readonly loginWithPasswordUsecase: LoginWithPasswordUsecase,
    private readonly fetchUserInfoUsecase: FetchUserInfoUsecase,
  ) {}

  @Mutation(() => LoginResult)
  async login(@Args('input') input: AuthLoginInput): Promise<LoginResult> {
    // 将 DTO 转换为领域模型
    const authLoginModel: AuthLoginModel = {
      loginName: input.loginName,
      loginPassword: input.loginPassword,
      type: input.type,
      ip: input.ip,
      audience: input.audience,
    };

    // 调用 usecase
    const result: LoginResultModel = await this.loginWithPasswordUsecase.execute(authLoginModel);

    // 获取用户信息
    const userInfo = await this.getUserInfoForGraphQL(result.accountId);

    // 将领域模型转换回 DTO
    const loginResult: LoginResult = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accountId: result.accountId,
      role: result.role,
      userInfo,
    };

    return loginResult;
  }

  /**
   * 获取用于 GraphQL 响应的用户信息
   * 使用现有的安全验证流程，确保 accessGroup 和 metaDigest 已完成比对
   */
  private async getUserInfoForGraphQL(accountId: number): Promise<UserInfoDTO> {
    // 使用现有的 executeForLoginFlow 方法，它已经包含了安全验证
    const completeUserData: CompleteUserData = await this.fetchUserInfoUsecase.executeForLoginFlow({
      accountId,
    });

    // 安全验证已在 executeForLoginFlow 中完成
    // 现在将 userInfoView 转换为安全的 DTO（移除 metaDigest）
    return this.mapUserInfoViewToSecureDTO(completeUserData.userInfoView);
  }

  /**
   * 将 UserInfoView 映射为安全的 UserInfoDTO
   * 移除敏感字段（如 metaDigest），确保不会泄露给前端
   */
  private mapUserInfoViewToSecureDTO(userInfoView: UserInfoView): UserInfoDTO {
    return {
      // 基础字段映射
      id: userInfoView.accountId,
      accountId: userInfoView.accountId,
      nickname: userInfoView.nickname,
      gender: userInfoView.gender,
      birthDate: userInfoView.birthDate,
      avatarUrl: userInfoView.avatarUrl,
      email: userInfoView.email,
      signature: userInfoView.signature,

      // 联系方式字段
      address: userInfoView.address,
      phone: userInfoView.phone,

      // 标签和地理位置 - 需要序列化为字符串
      tags: userInfoView.tags,
      geographic: this.serializeGeographic(userInfoView.geographic),

      // 访问组和通知
      accessGroup: userInfoView.accessGroup,
      notifyCount: userInfoView.notifyCount,
      unreadCount: userInfoView.unreadCount,

      // 状态和时间戳
      userState: userInfoView.userState,
      createdAt: userInfoView.createdAt,
      updatedAt: userInfoView.updatedAt,
    };
  }

  /**
   * 将 GeographicInfo 对象序列化为字符串
   * @param geographic 地理位置信息对象
   * @returns 序列化后的字符串或 null
   */
  private serializeGeographic(geographic: GeographicInfo | null): string | null {
    if (!geographic) return null;

    const parts: string[] = [];
    if (geographic.province) parts.push(geographic.province);
    if (geographic.city) parts.push(geographic.city);

    return parts.length > 0 ? parts.join(', ') : null;
  }
}
