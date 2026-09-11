// src/adapters/api/graphql/account/admin-user.resolver.ts

import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { mapJwtToUsecaseSession, type UsecaseSession } from '@app-types/auth/session.types';
import { JwtPayload } from '@app-types/jwt.types';
import { ValidateInput } from '@adapters/api/graphql/common/validate-input.decorator';
import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { mapGqlToCoreParams } from '@src/adapters/api/graphql/pagination.mapper';
import { PaginationArgs } from '@src/adapters/api/graphql/pagination.args';
import { AdminChangeUserRoleInput } from '@src/adapters/api/graphql/account/dto/admin-change-user-role.input';
import { AdminCreateUserInput } from '@src/adapters/api/graphql/account/dto/admin-create-user.input';
import { AdminResetUserPasswordInput } from '@src/adapters/api/graphql/account/dto/admin-reset-user-password.input';
import {
  AdminResetUserPasswordResultDTO,
  toAdminResetUserPasswordResultDTO,
} from '@src/adapters/api/graphql/account/dto/admin-reset-user-password-result.dto';
import { AdminSetUserStatusInput } from '@src/adapters/api/graphql/account/dto/admin-set-user-status.input';
import { AdminUpdateUserProfileInput } from '@src/adapters/api/graphql/account/dto/admin-update-user-profile.input';
import { AdminUserDTO, toAdminUserDTO } from '@src/adapters/api/graphql/account/dto/admin-user.dto';
import { AdminUserListPageDTO } from '@src/adapters/api/graphql/account/dto/admin-user-list-page.dto';
import { currentUser } from '@src/adapters/api/graphql/decorators/current-user.decorator';
import { Roles } from '@src/adapters/api/graphql/decorators/roles.decorator';
import { JwtAuthGuard } from '@src/adapters/api/graphql/guards/jwt-auth.guard';
import { RolesGuard } from '@src/adapters/api/graphql/guards/roles.guard';
import { AdminChangeUserRoleUsecase } from '@src/usecases/account/admin-change-user-role.usecase';
import { AdminCreateUserUsecase } from '@src/usecases/account/admin-create-user.usecase';
import { AdminResetUserPasswordUsecase } from '@src/usecases/account/admin-reset-user-password.usecase';
import { AdminSetUserStatusUsecase } from '@src/usecases/account/admin-set-user-status.usecase';
import { AdminUpdateUserProfileUsecase } from '@src/usecases/account/admin-update-user-profile.usecase';
import { ListAdminUsersUsecase } from '@src/usecases/account/list-admin-users.usecase';

/**
 *
 * 职责边界（`docs/api/adapters.rules.md`）：
 * - 只做协议输入映射、Usecase 调用与 View → DTO 薄映射；业务规则、事务、
 *   目标保护、角色/状态白名单全部归 Usecase；
 * - 不依赖 modules(service)、QueryService、Repository 或 infrastructure；
 * - 错误不在此捕获：DomainError 直接上抛进入全局 GraphQL exception filter，
 *
 * - 粗粒度准入：`JwtAuthGuard` + `RolesGuard` + `@Roles(SUPER_ADMIN)`；
 * - 精确授权：每个 Usecase 继续执行 `activeRole === SUPER_ADMIN` 的
 *   `assertAdminUserManagementPermission()` 断言（全仓唯一实现），
 *   Guard 不能替代 Usecase 的业务授权；
 * - 即时失效：停用 / 降级账号的旧 Token 由 `ValidateAccessTokenSessionUsecase`
 *   （P0-7）在每个受保护请求上复核。
 */
@Resolver()
export class AdminUserResolver {
  constructor(
    private readonly listAdminUsersUsecase: ListAdminUsersUsecase,
    private readonly adminCreateUserUsecase: AdminCreateUserUsecase,
    private readonly adminUpdateUserProfileUsecase: AdminUpdateUserProfileUsecase,
    private readonly adminChangeUserRoleUsecase: AdminChangeUserRoleUsecase,
    private readonly adminSetUserStatusUsecase: AdminSetUserStatusUsecase,
    private readonly adminResetUserPasswordUsecase: AdminResetUserPasswordUsecase,
  ) {}

  /**
   * 管理员分页查询用户列表。
   * keyword 由 Usecase trim 后对登录名、登录邮箱、昵称做参数化模糊搜索；
   * role / status 缺省表示不按该维度筛选；排序由契约固定（created_at DESC, id DESC），
   * 不接受客户端排序字段。
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Query(() => AdminUserListPageDTO, { name: 'adminUsers', description: '管理员分页查询用户列表' })
  @ValidateInput()
  async adminUsers(
    @Args('pagination', { description: '分页参数' }) pagination: PaginationArgs,
    @currentUser() user: JwtPayload,
    @Args('keyword', {
      type: () => String,
      nullable: true,
      description: '关键字（登录名/登录邮箱/昵称模糊搜索）',
    })
    keyword?: string,
    @Args('role', {
      type: () => IdentityTypeEnum,
      nullable: true,
      description: '角色筛选（查看值域，含 SUPER_ADMIN）',
    })
    role?: IdentityTypeEnum,
    @Args('status', {
      type: () => AccountStatus,
      nullable: true,
      description: '状态筛选（可筛选值域仅 ACTIVE / INACTIVE）',
    })
    status?: AccountStatus,
  ): Promise<AdminUserListPageDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const page = await this.listAdminUsersUsecase.execute({
      session,
      pagination: mapGqlToCoreParams(pagination),
      keyword,
      role,
      status,
    });
    return {
      items: page.items.map((item) => toAdminUserDTO(item)),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
    };
  }

  /**
   * 管理员创建 ENGINEER / CUSTOMER 用户。
   * 登录名 / 登录邮箱至少一个；创建固定为 ACTIVE；凭据唯一冲突对外为 CONFLICT。
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Mutation(() => AdminUserDTO, { name: 'adminCreateUser', description: '管理员创建用户' })
  @ValidateInput()
  async adminCreateUser(
    @Args('input') input: AdminCreateUserInput,
    @currentUser() user: JwtPayload,
  ): Promise<AdminUserDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const view = await this.adminCreateUserUsecase.execute({
      session,
      loginName: input.loginName,
      loginEmail: input.loginEmail,
      loginPassword: input.initialPassword,
      role: input.role,
      nickname: input.nickname,
      companyName: input.companyName,
      phone: input.phone,
      contactEmail: input.contactEmail,
    });
    return toAdminUserDTO(view);
  }

  /**
   * 管理员编辑普通用户资料（昵称 / 公司名称 / 电话 / 联系邮箱）。
   * 昵称不传 = 不修改、string = 修改且禁止 null / 空白；其余可选字段三态：
   * 不传 = 不修改，null = 清空。
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Mutation(() => AdminUserDTO, {
    name: 'adminUpdateUserProfile',
    description: '管理员编辑普通用户资料',
  })
  @ValidateInput()
  async adminUpdateUserProfile(
    @Args('input') input: AdminUpdateUserProfileInput,
    @currentUser() user: JwtPayload,
  ): Promise<AdminUserDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const view = await this.adminUpdateUserProfileUsecase.execute({
      session,
      accountId: input.accountId,
      nickname: input.nickname,
      companyName: input.companyName,
      phone: input.phone,
      contactEmail: input.contactEmail,
    });
    return toAdminUserDTO(view);
  }

  /**
   * 管理员在 ENGINEER / CUSTOMER 间修改单一角色。
   * 目标含 SUPER_ADMIN 拒绝；目标当前角色已等于目标角色时幂等零写入。
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Mutation(() => AdminUserDTO, { name: 'adminChangeUserRole', description: '管理员修改用户角色' })
  @ValidateInput()
  async adminChangeUserRole(
    @Args('input') input: AdminChangeUserRoleInput,
    @currentUser() user: JwtPayload,
  ): Promise<AdminUserDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const view = await this.adminChangeUserRoleUsecase.execute({
      session,
      accountId: input.accountId,
      role: input.role,
    });
    return toAdminUserDTO(view);
  }

  /**
   * 管理员在 ACTIVE / INACTIVE 间切换状态（双字段同步由 Usecase 完成）。
   * 任何 SUPER_ADMIN 目标拒绝；管理员不能停用自己。
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Mutation(() => AdminUserDTO, { name: 'adminSetUserStatus', description: '管理员设置用户状态' })
  @ValidateInput()
  async adminSetUserStatus(
    @Args('input') input: AdminSetUserStatusInput,
    @currentUser() user: JwtPayload,
  ): Promise<AdminUserDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const view = await this.adminSetUserStatusUsecase.execute({
      session,
      accountId: input.accountId,
      status: input.status,
    });
    return toAdminUserDTO(view);
  }

  /**
   * 管理员手动设置普通用户新密码。
   * 不走公开 verification token 流程；目标状态边界（仅双字段一致的
   * ACTIVE / INACTIVE）由 Usecase 在哈希生成与任何写入之前裁决。
   */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(IdentityTypeEnum.SUPER_ADMIN)
  @Mutation(() => AdminResetUserPasswordResultDTO, {
    name: 'adminResetUserPassword',
    description: '管理员重置普通用户密码',
  })
  @ValidateInput()
  async adminResetUserPassword(
    @Args('input') input: AdminResetUserPasswordInput,
    @currentUser() user: JwtPayload,
  ): Promise<AdminResetUserPasswordResultDTO> {
    const session: UsecaseSession = mapJwtToUsecaseSession(user);
    const result = await this.adminResetUserPasswordUsecase.execute({
      session,
      accountId: input.accountId,
      newPassword: input.newPassword,
    });
    return toAdminResetUserPasswordResultDTO(result);
  }
}
