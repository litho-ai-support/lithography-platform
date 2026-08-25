export interface ExceptionPayload {
  /** 覆盖 GraphQL extensions.code（大类）——很少用 */
  code?: string;
  /** 业务细分码 */
  errorCode?: string;
  /** 业务可读消息 */
  errorMessage?: string;
  /** Nest HttpException 可能带的 message（string | string[]） */
  message?: string | string[];
  [key: string]: unknown;
}
