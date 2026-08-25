// 文件位置： src/usecases/verification/verification-usecases.module.ts
import { PasswordModule } from '@modules/common/password/password.module';
import { AccountInstallerModule } from '@modules/account/account-installer.module';
import { Module } from '@nestjs/common';
import { VerificationRecordModule } from '@src/modules/verification-record/verification-record.module';
import { ConsumeVerificationFlowUsecase } from '@src/usecases/verification/consume-verification-flow.usecase';
import { ResetPasswordHandler } from '@src/usecases/verification/password/reset-password.handler';
import { ResetPasswordUsecase } from '@src/usecases/verification/password/reset-password.usecase';

@Module({
  imports: [VerificationRecordModule, AccountInstallerModule, PasswordModule],
  providers: [ConsumeVerificationFlowUsecase, ResetPasswordUsecase, ResetPasswordHandler],
  exports: [ConsumeVerificationFlowUsecase],
})
export class VerificationUsecasesModule {}
