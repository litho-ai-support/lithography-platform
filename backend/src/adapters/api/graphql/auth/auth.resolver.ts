// src/adapters/api/graphql/auth/auth.resolver.ts

import type { EnrichedLoginResult } from '@src/modules/auth/auth.types';
import { AuthLoginModel } from '@app-types/models/auth.types';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { LoginWithPasswordUsecase } from '@usecases/auth/login-with-password.usecase';
import { mapUserInfoViewToDTO } from '../account/user-info-view.mapper';
import { LoginResult } from '../account/dto/login-result.dto';
import { AuthLoginInput } from './dto/auth-login.input';

/**
 * 认证相关的 GraphQL Resolver
 */
@Resolver()
export class AuthResolver {
  constructor(private readonly loginWithPasswordUsecase: LoginWithPasswordUsecase) {}

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

    // 单一登录流程入口：用例内部完成凭据校验、安全校验、发券与用户资料读取
    const result: EnrichedLoginResult = await this.loginWithPasswordUsecase.execute(authLoginModel);

    // 将领域模型转换回 DTO（userInfo 由登录流程一并装配）
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accountId: result.accountId,
      role: result.role,
      userInfo: result.userInfoView ? mapUserInfoViewToDTO(result.userInfoView) : null,
    };
  }
}
