// src/usecases/registration/registration-usecases.module.ts
import { AccountInstallerModule } from '@modules/account/account-installer.module';
import { PasswordModule } from '@modules/common/password/password.module';
import { ThirdPartyAuthModule } from '@modules/third-party-auth/third-party-auth.module';
import { Module } from '@nestjs/common';
import { VerificationRecordModule } from '@src/modules/verification-record/verification-record.module';
import { RegisterWithEmailUsecase } from '@src/usecases/registration/register-with-email.usecase';
import { RegisterWithThirdPartyUsecase } from '@src/usecases/registration/register-with-third-party.usecase';
import { WeappRegisterUsecase } from '@src/usecases/registration/weapp-register.usecase';

@Module({
  imports: [VerificationRecordModule, AccountInstallerModule, PasswordModule, ThirdPartyAuthModule],
  providers: [RegisterWithEmailUsecase, RegisterWithThirdPartyUsecase, WeappRegisterUsecase],
  exports: [RegisterWithEmailUsecase, RegisterWithThirdPartyUsecase, WeappRegisterUsecase],
})
export class RegistrationUsecasesModule {}
