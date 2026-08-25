import type { AudienceTypeEnum } from '@app-types/models/account.types';

export interface GenerateWeappQrcodeParams {
  /** 客户端类型 */
  audience: AudienceTypeEnum;
  /** 场景值（最多 32 个可见字符） */
  scene: string;
  /** 小程序页面路径（不带参数，示例：pages/index/index） */
  page?: string;
  /** 图片宽度（像素，280–1280） */
  width?: number;
  /** 是否校验页面路径（默认 true） */
  checkPath?: boolean;
  /** 小程序版本（develop/trial/release） */
  envVersion?: 'develop' | 'trial' | 'release';
  /** 是否透明底色 */
  isHyaline?: boolean;
  /** 是否返回 base64，默认 true；false 则返回 Buffer */
  encodeBase64?: boolean;
}

export interface GenerateWeappQrcodeResult {
  /** 图片内容类型（通常为 image/png） */
  contentType: string;
  /** 图片 Base64 字符串（当 encodeBase64=true 时返回） */
  imageBase64?: string;
  /** 图片二进制（当 encodeBase64=false 时返回） */
  imageBuffer?: Buffer;
}
