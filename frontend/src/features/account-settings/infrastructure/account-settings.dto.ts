// src/features/account-settings/infrastructure/account-settings.dto.ts

/**
 * 账号设置 feature 的原始 GraphQL DTO。
 * 仅描述后端 schema 的 myAccountSettings / updateMyAccountSettings / changeMyPassword
 * 三个 operation 的原始形状，不承载业务规则；经 mapper 清洗后才能进入 application。
 * 这些类型不得越出 infrastructure，application 与 ui 一律消费 feature 内部模型。
 */

export type MyAccountSettingsDto = {
  companyName: string | null;
  contactEmail: string | null;
  loginEmail: string | null;
  loginName: string | null;
  nickname: string;
  phone: string | null;
  role: string;
  status: string;
  updatedAt: string;
};

export type UpdateMyAccountSettingsResultDto = {
  isUpdated: boolean;
  settings: MyAccountSettingsDto;
};

export type ChangeMyPasswordResultDto = {
  isUpdated: boolean;
  notice: string;
};
