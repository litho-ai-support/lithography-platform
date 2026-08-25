// src/adapters/api/graphql/decorators/public.decorator.ts

import { SetMetadata } from '@nestjs/common';

/**
 * 公开访问装饰器
 * 标记不需要身份验证的 GraphQL 端点
 */
export const IS_PUBLIC_KEY = 'isPublic';

/**
 * 公开访问装饰器
 * 用于标记不需要身份验证的 GraphQL 解析器方法
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function Public(): MethodDecorator & ClassDecorator {
  return SetMetadata(IS_PUBLIC_KEY, true);
}
