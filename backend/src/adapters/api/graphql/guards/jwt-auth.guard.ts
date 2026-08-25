// src/adapters/api/graphql/guards/jwt-auth.guard.ts

import { JwtPayload } from '@app-types/jwt.types';
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthGuard } from '@nestjs/passport';
import { DomainError, JWT_ERROR } from '@core/common/errors/domain-error';
import type { Request } from 'express';

/**
 * JWT 认证守卫
 * 支持 GraphQL 和 REST API 的 JWT 认证
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') implements CanActivate {
  constructor() {
    super();
  }

  /**
   * 获取请求对象（支持 GraphQL 和 REST）
   * @param context 执行上下文
   * @returns 请求对象
   */
  getRequest(context: ExecutionContext): Request {
    if (context.getType() === 'http') {
      // REST 请求
      return context.switchToHttp().getRequest();
    }

    // GraphQL 请求
    const gqlCtx = GqlExecutionContext.create(context);
    const graphqlContext = gqlCtx.getContext<{ req: Request }>();
    return graphqlContext.req;
  }

  /**
   * 处理请求验证结果
   * @param err 认证过程中的错误
   * @param user 认证成功后的用户信息
   * @param info 额外信息
   * @param context 执行上下文
   * @returns 用户信息
   */
  handleRequest<TUser = JwtPayload>(
    err: Error | null,
    user: TUser | false,
    _info: unknown,
    _context: ExecutionContext,
  ): TUser {
    // 如果有错误或用户信息为空，则认证失败
    if (err || !user) {
      // 如果已经是 DomainError，直接抛出
      if (err && err instanceof DomainError) {
        throw err;
      }

      // 抛出统一的认证失败错误
      throw new DomainError(
        JWT_ERROR.AUTHENTICATION_FAILED,
        'JWT 认证失败',
        { originalError: err?.message },
        err,
      );
    }

    return user;
  }
}
