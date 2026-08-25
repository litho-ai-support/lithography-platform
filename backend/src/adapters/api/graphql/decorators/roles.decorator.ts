// 文件位置：src/adapters/api/graphql/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common';

/**
 * 角色装饰器
 * 为 GraphQL 解析器类或方法标注所需角色，配合 RolesGuard 使用进行权限校验
 * @param roles 允许访问的角色列表（字符串形式，如 "admin"、"staff"）
 * @returns 方法或类装饰器
 */
// eslint-disable-next-line @typescript-eslint/naming-convention
export function Roles(...roles: string[]): MethodDecorator & ClassDecorator {
  return SetMetadata('roles', roles);
}
