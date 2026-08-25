// src/types/models/third-party-auth.types.ts
import { AudienceTypeEnum, ThirdPartyProviderEnum } from './account.types';
/**
 * 第三方会话信息
 * 统一封装不同第三方平台返回的用户身份数据
 */
export type ThirdPartySession = {
  /** 第三方平台用户唯一标识 (如微信 openid、OAuth sub、用户 id) */
  providerUserId: string;
  /** 联合 ID，用于跨应用识别同一用户 (仅特定平台返回，如微信 unionid) */
  unionId: string | null;
  /** 用户基本信息 (仅特定平台返回，如 OAuth 用户信息接口) */
  profile?: {
    /** 用户昵称 */
    nickname?: string | null;
    /** 用户邮箱 */
    email?: string | null;
    /** 用户头像 URL */
    avatarUrl?: string | null;
  };
  /** 微信小程序会话密钥原始值 (仅 WeApp 平台返回，上层仅存摘要) */
  sessionKeyRaw?: string;
  /** OIDC ID Token 的 header.payload 部分 (仅 OIDC 平台返回，用于审计) */
  idTokenHeaderPayload?: string;
};

export type ThirdPartyLoginInputModel = {
  provider: ThirdPartyProviderEnum;
  authCredential: string;
  audience: AudienceTypeEnum;
  ip?: string;
};

export type BindThirdPartyInputModel = {
  provider: ThirdPartyProviderEnum;
  providerUserId: string;
  unionId?: string | null;
  accessToken?: string | null;
};

export type ThirdPartyAuthView = {
  id: number;
  accountId: number;
  provider: ThirdPartyProviderEnum;
  providerUserId: string;
  unionId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type UnbindThirdPartyInputModel =
  | {
      id: number;
      provider?: ThirdPartyProviderEnum;
    }
  | {
      id?: number;
      provider: ThirdPartyProviderEnum;
    };

/**
 * 微信小程序 code2session 接口成功响应
 */
export interface WeAppCode2SessionSuccess {
  /** 用户唯一标识 */
  openid: string;
  /** 会话密钥 */
  session_key: string;
  /** 用户在微信开放平台的唯一标识 (可选) */
  unionid?: string;
}

/**
 * 微信小程序 code2session 接口错误响应
 */
export interface WeAppCode2SessionError {
  /** 错误码 */
  errcode: number;
  /** 错误信息 */
  errmsg: string;
}

/**
 * 微信小程序 code2session 接口响应联合类型
 */
export type WeAppCode2SessionResponse = WeAppCode2SessionSuccess | WeAppCode2SessionError;

/**
 * 微信小程序获取手机号接口成功响应
 */
export interface WeAppGetPhoneNumberSuccess {
  /** 错误码（成功时为 0） */
  errcode: 0;
  /** 错误信息（成功时为 "ok"） */
  errmsg: string;
  /** 手机号信息 */
  phone_info: {
    /** 用户绑定的手机号（国外手机号会有区号） */
    phoneNumber: string;
    /** 不带区号的手机号 */
    purePhoneNumber: string;
    /** 区号（数字类型） */
    countryCode: number;
    /** 数据水印 */
    watermark: {
      /** 小程序 appid */
      appid: string;
      /** 时间戳 */
      timestamp: number;
    };
  };
}

/**
 * 微信小程序获取手机号接口错误响应
 */
export interface WeAppGetPhoneNumberError {
  /** 错误码 */
  errcode: number;
  /** 错误信息 */
  errmsg: string;
}

/**
 * 微信小程序获取手机号接口响应联合类型
 */
export type WeAppGetPhoneNumberResponse = WeAppGetPhoneNumberSuccess | WeAppGetPhoneNumberError;

/**
 * 获取手机号的结果
 */
export interface PhoneNumberResult {
  /** 完整手机号（包含区号） */
  phoneNumber: string;
  /** 纯手机号（不含区号） */
  purePhoneNumber: string;
  /** 国家区号（字符串类型，便于前端处理） */
  countryCode: string;
}

/**
 * 微信小程序获取 access_token 接口成功响应
 */
export interface WeAppGetAccessTokenSuccess {
  /** access_token */
  access_token: string;
  /** 凭证有效时间，单位：秒 */
  expires_in: number;
}

/**
 * 微信小程序获取 access_token 接口错误响应
 */
export interface WeAppGetAccessTokenError {
  /** 错误码 */
  errcode: number;
  /** 错误信息 */
  errmsg: string;
}

/**
 * 微信小程序获取 access_token 接口响应联合类型
 */
export type WeAppGetAccessTokenResponse = WeAppGetAccessTokenSuccess | WeAppGetAccessTokenError;
