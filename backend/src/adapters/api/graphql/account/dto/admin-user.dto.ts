// src/adapters/api/graphql/account/dto/admin-user.dto.ts

import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { Field, Int, ObjectType } from '@nestjs/graphql';
import type { AdminUserView } from '@src/modules/account/account.types';

/**
 * 管理员用户管理 DTO（P0-8）。
 *
 * 由 `AdminUserView`（modules/account 稳定 View）薄映射而来，只做字段直通，
 * - `contactEmail` 是联系邮箱（`base_user_info.email`），与登录凭据邮箱 `loginEmail`
 *   严格区分，不得互相代替；
 * - `role` 是三源收敛后的单值角色；`role === SUPER_ADMIN` 即只读行，
 *   只读语义由前端 application 单点派生，本 DTO 不冗余表达；
 */
@ObjectType({ description: '管理员用户管理条目（列表与写后读共用同一形态）' })
export class AdminUserDTO {
  @Field(() => Int, { description: '账号 ID' })
  id!: number;

  @Field(() => String, { description: '登录名', nullable: true })
  loginName!: string | null;

  @Field(() => String, { description: '登录邮箱（登录凭据）', nullable: true })
  loginEmail!: string | null;

  @Field(() => String, { description: '昵称' })
  nickname!: string;

  @Field(() => String, { description: '公司名称', nullable: true })
  companyName!: string | null;

  @Field(() => String, { description: '电话', nullable: true })
  phone!: string | null;

  @Field(() => String, { description: '联系邮箱（非登录凭据）', nullable: true })
  contactEmail!: string | null;

  @Field(() => IdentityTypeEnum, { description: '单一业务角色' })
  role!: IdentityTypeEnum;

  @Field(() => AccountStatus, { description: '账号状态' })
  status!: AccountStatus;

  @Field(() => Date, { description: '创建时间' })
  createdAt!: Date;

  @Field(() => Date, { description: '最近变更时间（账号侧与资料侧较新值）' })
  updatedAt!: Date;
}

/**
 * View → DTO 薄映射（字段直通，供 Resolver 复用；不做任何业务判断）。
 */
export function toAdminUserDTO(view: AdminUserView): AdminUserDTO {
  return {
    id: view.id,
    loginName: view.loginName,
    loginEmail: view.loginEmail,
    nickname: view.nickname,
    companyName: view.companyName,
    phone: view.phone,
    contactEmail: view.contactEmail,
    role: view.role,
    status: view.status,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}
