// src/types/models/ai-conversation.types.ts
// AI 会话共享稳定枚举（PR3 定向 Review M-01 裁定）：
// 放共享类型层供 GraphQL adapter 注册正式枚举；Entity / Module / DTO 共用，不复制第二套，
// adapter 层不得运行时依赖 modules 实现。

/** AI 会话状态（数据库枚举值 ai_conversation.status：ACTIVE / COMPLETED） */
export enum AiConversationStatus {
  ACTIVE = 'ACTIVE',
  COMPLETED = 'COMPLETED',
}

/** AI 会话消息角色（数据库枚举值 ai_message.role：SYSTEM / USER / ASSISTANT / TOOL） */
export enum AiMessageRole {
  SYSTEM = 'SYSTEM',
  USER = 'USER',
  ASSISTANT = 'ASSISTANT',
  TOOL = 'TOOL',
}
