// src/adapters/api/graphql/pagination.enums.ts
// GraphQL 枚举：仅定义，不在此文件内进行注册。注册统一在 schema.init.ts -> enum.registry.ts 完成。

export enum GqlPaginationMode {
  OFFSET = 'OFFSET',
  CURSOR = 'CURSOR',
}

export enum GqlSortDirection {
  ASC = 'ASC',
  DESC = 'DESC',
}
