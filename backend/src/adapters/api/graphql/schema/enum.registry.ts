// src/adapters/api/graphql/schema/enum.registry.ts

import {
  // 导入所有需要注册的枚举类型（仅依赖 @app-types）
  AccountStatus,
  AudienceTypeEnum,
  EmploymentStatus,
  IdentityTypeEnum,
  LoginTypeEnum,
  ThirdPartyLoginProviderEnum,
  ThirdPartyProviderEnum,
} from '@app-types/models/account.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import {
  CreatableVerificationRecordType,
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import { RegisterTypeEnum } from '@app-types/services/register.types';
import { registerEnumType } from '@nestjs/graphql';
import { GqlPaginationMode, GqlSortDirection } from '@src/adapters/api/graphql/pagination.enums';
import { OrderDirection } from '@app-types/common/sort.types';

export function registerEnums(): void {
  registerEnumType(AccountStatus, { name: 'AccountStatus' });
  registerEnumType(AudienceTypeEnum, { name: 'AudienceTypeEnum' });
  registerEnumType(EmploymentStatus, { name: 'EmploymentStatus' });
  registerEnumType(IdentityTypeEnum, { name: 'IdentityTypeEnum' });
  registerEnumType(LoginTypeEnum, { name: 'LoginTypeEnum' });
  registerEnumType(ThirdPartyLoginProviderEnum, { name: 'ThirdPartyLoginProviderEnum' });
  registerEnumType(ThirdPartyProviderEnum, { name: 'ThirdPartyProviderEnum' });
  registerEnumType(RegisterTypeEnum, { name: 'RegisterTypeEnum' });
  registerEnumType(Gender, { name: 'Gender' });
  registerEnumType(UserState, { name: 'UserState' });
  registerEnumType(SubjectType, { name: 'SubjectType' });
  registerEnumType(VerificationRecordStatus, { name: 'VerificationRecordStatus' });
  registerEnumType(VerificationRecordType, { name: 'VerificationRecordType' });
  registerEnumType(CreatableVerificationRecordType, { name: 'CreatableVerificationRecordType' });
  registerEnumType(OrderDirection, { name: 'OrderDirection' });
  registerEnumType(GqlPaginationMode, { name: 'PaginationMode' });
  registerEnumType(GqlSortDirection, { name: 'SortDirection' });
}
