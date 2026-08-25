// src/adapters/api/graphql/schema/schema.init.ts

import { createHash } from 'crypto';
import { registerEnums } from './enum.registry';
import { registerScalars } from './scalar.registry';

/**
 * 模块内静态标记，确保只初始化一次
 */
let inited = false;

/**
 * 生成 Schema 指纹
 * 基于枚举值生成轻量级哈希，用于 Schema 同步检查
 * @param enums 已注册的枚举名称列表
 * @param scalars 已注册的标量名称列表
 * @returns Schema 指纹字符串
 */
function generateSchemaFingerprint(enums: string[], scalars: string[]): string {
  // 将所有注册的类型名称排序后拼接
  const allTypes = [...enums, ...scalars].sort();
  const typeString = allTypes.join('|');

  // 生成简单的 MD5 哈希作为指纹
  return createHash('md5').update(typeString).digest('hex').substring(0, 8);
}

/**
 * 初始化 GraphQL Schema
 * 单点注册所有枚举和标量类型，具有一次性守卫和指纹生成功能
 * @returns 初始化结果，包含注册统计和指纹信息
 */
export function initGraphQLSchema(): {
  success: boolean;
  enums: string[];
  scalars: string[];
  fingerprint: string;
  message: string;
} {
  // 重复调用统一处理：开发环境和生产环境都只警告并返回
  // 避免热更新、Jest/E2E 测试、并发场景误伤
  if (inited) {
    return {
      success: false,
      enums: [],
      scalars: [],
      fingerprint: '',
      message: 'Schema 已初始化，重复调用已忽略',
    };
  }

  try {
    // 注册枚举类型
    registerEnums();

    // 注册标量类型
    const scalarResult = registerScalars();

    // 由于 registerEnums 不再返回枚举列表，使用预期枚举列表
    const enumList = [
      'AccountStatus',
      'AudienceTypeEnum',
      'EmploymentStatus',
      'IdentityTypeEnum',
      'LoginTypeEnum',
      'ThirdPartyProviderEnum',
      'RegisterTypeEnum',
      'Gender',
      'UserState',
      'SubjectType',
      'VerificationRecordStatus',
      'VerificationRecordType',
      'OrderDirection',
      'PaginationMode',
      'SortDirection',
    ];

    // 生成 Schema 指纹
    const fingerprint = generateSchemaFingerprint(enumList, scalarResult.scalars);

    // 计算总类型数
    const totalTypes = enumList.length + scalarResult.scalars.length;

    // 标记为已初始化
    inited = true;

    return {
      success: true,
      enums: enumList,
      scalars: scalarResult.scalars,
      fingerprint,
      message: `成功注册 ${totalTypes} 个 GraphQL 类型`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    // eslint-disable-next-line no-console
    console.error('❌ GraphQL Schema 初始化失败:', errorMessage);

    throw new Error(`GraphQL Schema 初始化失败: ${errorMessage}`, {
      cause: error,
    });
  }
}
