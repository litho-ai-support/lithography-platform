// src/features/admin-user-management/infrastructure/admin-user-management.dto.ts

/**
 * 管理员用户管理的原始 GraphQL DTO（防腐层输入面）。
 * 仅描述后端 schema（backend/src/schema.graphql 的 adminUsers / admin* 系列）的原始形状，
 * 不承载业务规则；经 mapper 清洗后才能进入 application（见 admin-user-management-mapper.ts）。
 * 这些类型不得越出 infrastructure，application 与 ui 一律消费 feature 内部模型。
 */

export type AdminUserDto = {
  companyName: string | null;
  contactEmail: string | null;
  createdAt: string;
  id: number;
  loginEmail: string | null;
  loginName: string | null;
  nickname: string;
  phone: string | null;
  role: string;
  status: string;
  updatedAt: string;
};

export type AdminUserListPageDto = {
  items: AdminUserDto[];
  page: number;
  pageSize: number;
  total: number;
};

export type AdminResetUserPasswordResultDto = {
  accountId: number;
  isUpdated: boolean;
  notice: string;
};
