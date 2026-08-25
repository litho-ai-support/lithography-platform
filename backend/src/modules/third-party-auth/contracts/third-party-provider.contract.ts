import { AudienceTypeEnum, ThirdPartyProviderEnum } from '@app-types/models/account.types';
import { PhoneNumberResult, ThirdPartySession } from '@app-types/models/third-party-auth.types';

export const THIRD_PARTY_PROVIDER_TOKENS = {
  WEAPP: Symbol('THIRD_PARTY_PROVIDER.WEAPP'),
  WECHAT: Symbol('THIRD_PARTY_PROVIDER.WECHAT'),
} as const;

/**
 * 第三方认证提供者接口
 * 定义统一的第三方平台认证规范
 */
export interface ThirdPartyProvider {
  /** 第三方平台类型标识 */
  readonly provider: ThirdPartyProviderEnum;

  /**
   * 交换第三方凭证获取用户身份信息
   * 统一接口：将不同平台的认证凭证转换为标准化的用户会话信息
   * @param params 交换参数
   * @param params.authCredential 第三方凭证 (如 OAuth code、id_token、access_token)
   * @param params.audience 客户端类型 (用于区分不同应用场景)
   * @returns 标准化的第三方会话信息
   */
  exchangeCredential({
    authCredential,
    audience,
  }: {
    authCredential: string;
    audience: AudienceTypeEnum;
  }): Promise<ThirdPartySession>;
}

export interface CreateWeAppCodeUnlimitParams {
  accessToken: string;
  scene: string;
  page?: string;
  width?: number;
  checkPath?: boolean;
  envVersion?: 'develop' | 'trial' | 'release';
  isHyaline?: boolean;
}

export interface WeAppQrcodeImage {
  buffer: Buffer;
  contentType: string;
}

export interface WeAppProviderContract extends ThirdPartyProvider {
  getAccessToken(params: { audience: AudienceTypeEnum }): Promise<string>;
  getPhoneNumber(params: {
    phoneCode: string;
    accessToken: string;
    audience: AudienceTypeEnum;
  }): Promise<PhoneNumberResult>;
  createWxaCodeUnlimit(params: CreateWeAppCodeUnlimitParams): Promise<WeAppQrcodeImage>;
}
