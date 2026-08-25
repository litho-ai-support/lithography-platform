// src/modules/common/password/password.module.ts
import { Module } from '@nestjs/common';
import { PasswordPolicyService } from '@core/common/password/password-policy.service';

@Module({
  providers: [PasswordPolicyService],
  exports: [PasswordPolicyService],
})
export class PasswordModule {}
