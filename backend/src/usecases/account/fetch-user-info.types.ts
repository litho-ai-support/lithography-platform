import type { IdentityTypeEnum } from '@app-types/models/account.types';
import type { UserInfoView } from '@app-types/models/auth.types';

/**
 * 完整的用户数据（包含安全验证结果）
 * 用于登录流程中的数据传递和安全比对
 */
export interface CompleteUserData {
  userInfoView: UserInfoView;
  securityResult: {
    isValid: boolean;
    wasSuspended: boolean;
    realAccessGroup?: IdentityTypeEnum[];
  };
}
