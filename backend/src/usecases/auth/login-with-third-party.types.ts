import type { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';

/**
 * 第三方登录用例输入
 * （纯 TS，协议无关；adapters 层的 GraphQL DTO 请勿在此引用）
 */
export interface ThirdPartyLoginParams {
  provider: ThirdPartyProviderEnum;
  authCredential: string; // 小程序 js_code、网页 code、id_token 等
  audience: AudienceTypeEnum;
  ip?: string;
}
