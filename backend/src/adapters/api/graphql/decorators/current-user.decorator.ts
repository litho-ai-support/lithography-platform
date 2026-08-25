// src/adapters/api/graphql/decorators/current-user.decorator.ts
import { JwtPayload } from '@app-types/jwt.types';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

/**
 * 获取当前用户信息的参数装饰器
 * 从 GraphQL 上下文中提取 JWT 用户信息
 */
export const currentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload => {
    const gqlCtx = GqlExecutionContext.create(context);
    const graphqlContext = gqlCtx.getContext<{ req: { user: JwtPayload } }>();
    return graphqlContext.req.user;
  },
);
