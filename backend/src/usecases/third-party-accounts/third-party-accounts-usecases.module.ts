// src/usecases/third-party-accounts/third-party-accounts-usecases.module.ts
import { ThirdPartyAuthModule } from '@modules/third-party-auth/third-party-auth.module';
import { Module } from '@nestjs/common';
import { BindThirdPartyAccountUsecase } from '@src/usecases/third-party-accounts/bind-third-party-account.usecase';
import { GenerateWeappQrcodeUsecase } from '@src/usecases/third-party-accounts/generate-weapp-qrcode.usecase';
import { GetThirdPartyAuthsUsecase } from '@src/usecases/third-party-accounts/get-third-party-auths.usecase';
import { GetWeappPhoneUsecase } from '@src/usecases/third-party-accounts/get-weapp-phone.usecase';
import { ResolveThirdPartyIdentityUsecase } from '@src/usecases/third-party-accounts/resolve-third-party-identity.usecase';
import { UnbindThirdPartyAccountUsecase } from '@src/usecases/third-party-accounts/unbind-third-party-account.usecase';

@Module({
  imports: [ThirdPartyAuthModule],
  providers: [
    BindThirdPartyAccountUsecase,
    GenerateWeappQrcodeUsecase,
    GetThirdPartyAuthsUsecase,
    GetWeappPhoneUsecase,
    ResolveThirdPartyIdentityUsecase,
    UnbindThirdPartyAccountUsecase,
  ],
  exports: [
    BindThirdPartyAccountUsecase,
    GenerateWeappQrcodeUsecase,
    GetThirdPartyAuthsUsecase,
    GetWeappPhoneUsecase,
    ResolveThirdPartyIdentityUsecase,
    UnbindThirdPartyAccountUsecase,
  ],
})
export class ThirdPartyAccountsUsecasesModule {}
