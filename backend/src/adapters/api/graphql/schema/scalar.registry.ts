// src/adapters/api/graphql/schema/scalar.registry.ts

/**
 * 注册所有 GraphQL 自定义标量类型
 * @returns 注册结果，包含已注册的标量名称列表
 */
export function registerScalars(): { scalars: string[] } {
  const registeredScalars: string[] = [];

  // 注意：在 NestJS 中，Date 类型会自动映射为 GraphQLISODateTime
  // 无需手动注册，GraphQL 会自动处理 Date 类型的序列化和反序列化
  // 如果将来需要添加自定义标量（如 JSON 等），可以在这里注册
  // 示例：
  // registerScalarType(GraphQLJSON, 'JSON');
  // registeredScalars.push('JSON');

  // 启用 JSON 标量类型（由 @Scalar('JSON') 提供者注册），这里仅记录类型名称用于指纹生成
  registeredScalars.push('JSON');

  return { scalars: registeredScalars };
}
