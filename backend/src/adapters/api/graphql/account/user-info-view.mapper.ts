// src/adapters/api/graphql/account/user-info-view.mapper.ts

import type { UserInfoView } from '@app-types/models/auth.types';
import type { GeographicInfo } from '@app-types/models/user-info.types';
import type { UserInfoDTO } from './dto/user-info.dto';

/**
 * 将 UserInfoView 映射为 UserInfoDTO（登录 / 资料读取等场景共用）
 * DTO 本身不含 metaDigest 等敏感字段，映射即完成脱敏
 */
export function mapUserInfoViewToDTO(view: UserInfoView): UserInfoDTO {
  return {
    // 基础字段映射
    id: view.accountId,
    accountId: view.accountId,
    nickname: view.nickname,
    gender: view.gender,
    birthDate: view.birthDate,
    avatarUrl: view.avatarUrl,
    email: view.email,
    signature: view.signature,

    // 联系方式字段
    address: view.address,
    phone: view.phone,

    // 访问组、标签和地理位置
    accessGroup: view.accessGroup,
    tags: view.tags,
    geographic: serializeGeographic(view.geographic),

    // 通知
    notifyCount: view.notifyCount,
    unreadCount: view.unreadCount,

    // 状态和时间戳
    userState: view.userState,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

/**
 * 将 GeographicInfo 对象序列化为字符串
 * @param geographic 地理位置信息对象
 * @returns 序列化后的字符串或 null
 */
export function serializeGeographic(geographic: GeographicInfo | null): string | null {
  if (!geographic) return null;

  const parts: string[] = [];
  if (geographic.province) parts.push(geographic.province);
  if (geographic.city) parts.push(geographic.city);

  return parts.length > 0 ? parts.join(', ') : null;
}
