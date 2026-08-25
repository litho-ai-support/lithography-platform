// src/usecases/verification-record/verification-record-usecases.module.ts
import { Module } from '@nestjs/common';
import { VerificationRecordModule } from '@src/modules/verification-record/verification-record.module';
import { ConsumeVerificationRecordUsecase } from './consume-verification-record.usecase';
import { CreateVerificationRecordUsecase } from './create-verification-record.usecase';
import { FindVerificationRecordUsecase } from './find-verification-record.usecase';

@Module({
  imports: [VerificationRecordModule],
  providers: [
    CreateVerificationRecordUsecase,
    ConsumeVerificationRecordUsecase,
    FindVerificationRecordUsecase,
  ],
  exports: [
    CreateVerificationRecordUsecase,
    ConsumeVerificationRecordUsecase,
    FindVerificationRecordUsecase,
  ],
})
export class VerificationRecordUsecasesModule {}
