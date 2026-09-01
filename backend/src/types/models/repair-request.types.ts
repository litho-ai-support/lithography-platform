// src/types/models/repair-request.types.ts
// 维修申请共享稳定枚举（负责人 20260901 裁定 4）：
// 放共享类型层供 GraphQL adapter 注册正式枚举；Entity / Usecase / DTO 共用，不复制第二套。

/**
 * 工程师回复处理状态。
 * 数据库枚举值 PENDING / RESOLVED（engineer_response.resolution_status），不涉及 Migration；
 * 第一版允许相互追加，最新一条回复代表当前处理状态（裁定 6）。
 */
export enum EngineerResolutionStatus {
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
}
