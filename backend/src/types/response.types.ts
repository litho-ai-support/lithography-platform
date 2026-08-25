// src/types/response.types.ts
/**
 * 显示类型枚举
 */
export enum ShowType {
  /** 静默 */
  SILENT = 0,
  /** 警告信息 */
  WARN_MESSAGE = 1,
  /** 错误信息 */
  ERROR_MESSAGE = 2,
  /** 通知 */
  NOTIFICATION = 4,
  /** 页面 */
  REDIRECT = 9,
}

/**
 * 统一响应格式接口
 * 基于 Ant Design Pro 约定
 * - 成功时：success: true, data 有值，其他错误相关字段 absent/undefined
 * - 失败时：success: false, data=null，errorCode/errorMessage/showType 必有值
 */
export interface ApiResponse<T = unknown> {
  /** 是否成功 */
  success: boolean;
  /** 响应数据（成功时有值，失败为 null） */
  data?: T | null;
  /** 错误码（失败时有值） */
  errorCode?: string;
  /** 错误信息（失败时有值） */
  errorMessage?: string;
  /** 显示类型 */
  showType?: ShowType;
  /** 便于后端故障排查的唯一请求 ID */
  requestId?: string;
  /** 服务器主机名 */
  host?: string;
}

/**
 * 专门描述分页内容的数据结构
 */
export interface PaginationResponse<T = unknown> {
  /** 数据列表 */
  list: T[];
  /** 当前页码 */
  current: number;
  /** 每页条数 */
  pageSize: number;
  /** 总条数 */
  total: number;
}

/**
 * 分页接口标准响应：ApiResponse<PaginationResponse<T>>
 * 推荐实际分页接口使用这个组合类型返回
 * 示例：
 * {
 *   success: true,
 *   data: {
 *     list: [...],
 *     current: 1,
 *     pageSize: 20,
 *     total: 180
 *   },
 *   requestId: "...",
 *   host: "..."
 * }
 */
export type PaginatedApiResponse<T = unknown> = ApiResponse<PaginationResponse<T>>;
