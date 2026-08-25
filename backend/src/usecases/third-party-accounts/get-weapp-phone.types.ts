import type { AudienceTypeEnum } from '@app-types/models/account.types';
import type { PhoneNumberResult } from '@app-types/models/third-party-auth.types';

/** 获取微信小程序手机号参数 */
export interface GetWeappPhoneParams {
  /** 手机号获取凭证 */
  phoneCode: string;
  /** 客户端类型 */
  audience: AudienceTypeEnum;
}

/** 获取微信小程序手机号结果 */
export interface GetWeappPhoneResult {
  /** 手机号信息 */
  phoneInfo: PhoneNumberResult;
}
