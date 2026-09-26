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

/**
 * 接单状态视角（当前会话观看单条申请的事实分类，非数据库枚举）：
 * - AVAILABLE：未接单（仅表示未接单事实，不代表当前会话可接单——
 *   接单能力由写用例按精确 ENGINEER 身份独立裁决，SUPER_ADMIN 无接单写权限）；
 * - MINE：接单工程师为当前会话账号；
 * - TAKEN_BY_OTHER：已被其他账号接单（SUPER_ADMIN 视角下已接单一律归此类）。
 * 由 usecase 依据会话账号与申请事实计算，客户端不可传入。
 */
export enum RepairRequestAcceptanceViewStatus {
  AVAILABLE = 'AVAILABLE',
  MINE = 'MINE',
  TAKEN_BY_OTHER = 'TAKEN_BY_OTHER',
}
