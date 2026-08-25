// src/types/common/sort.types.ts

/**
 * 排序方向枚举
 * 通用的排序方向定义，避免与数据库层面的 "sortOrder" 混用
 */
export enum OrderDirection {
  /** 升序 */
  ASC = 'ASC',
  /** 降序 */
  DESC = 'DESC',
}
