// src/usecases/account/account-usecases.module.ts
import { Module } from '@nestjs/common';
import { AccountInstallerModule } from '@src/modules/account/account-installer.module';
import { PasswordModule } from '@src/modules/common/password/password.module';
import { AdminChangeUserRoleUsecase } from '@src/usecases/account/admin-change-user-role.usecase';
import { AdminCreateUserUsecase } from '@src/usecases/account/admin-create-user.usecase';
import { AdminResetUserPasswordUsecase } from '@src/usecases/account/admin-reset-user-password.usecase';
import { AdminSetUserStatusUsecase } from '@src/usecases/account/admin-set-user-status.usecase';
import { AdminUpdateUserProfileUsecase } from '@src/usecases/account/admin-update-user-profile.usecase';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { FetchIdentityByRoleUsecase } from '@src/usecases/account/fetch-identity-by-role.usecase';
import { FetchUserInfoUsecase } from '@src/usecases/account/fetch-user-info.usecase';
import { GetAccountByIdUsecase } from '@src/usecases/account/get-account-by-id.usecase';
import { GetVisibleUserInfoUsecase } from '@src/usecases/account/get-visible-user-info.usecase';
import { ListAdminUsersUsecase } from '@src/usecases/account/list-admin-users.usecase';
import {
  UpdateAccessGroupUsecase,
  UpdateVisibleUserInfoUsecase,
} from '@src/usecases/account/update-visible-user-info.usecase';

@Module({
  imports: [AccountInstallerModule, PasswordModule],
  providers: [
    AdminChangeUserRoleUsecase,
    AdminCreateUserUsecase,
    AdminResetUserPasswordUsecase,
    AdminSetUserStatusUsecase,
    AdminUpdateUserProfileUsecase,
    CreateAccountUsecase,
    FetchIdentityByRoleUsecase,
    FetchUserInfoUsecase,
    GetAccountByIdUsecase,
    GetVisibleUserInfoUsecase,
    ListAdminUsersUsecase,
    UpdateVisibleUserInfoUsecase,
    UpdateAccessGroupUsecase,
  ],
  exports: [
    AdminChangeUserRoleUsecase,
    AdminCreateUserUsecase,
    AdminResetUserPasswordUsecase,
    AdminSetUserStatusUsecase,
    AdminUpdateUserProfileUsecase,
    CreateAccountUsecase,
    FetchIdentityByRoleUsecase,
    FetchUserInfoUsecase,
    GetAccountByIdUsecase,
    GetVisibleUserInfoUsecase,
    ListAdminUsersUsecase,
    UpdateVisibleUserInfoUsecase,
    UpdateAccessGroupUsecase,
  ],
})
export class AccountUsecasesModule {}
