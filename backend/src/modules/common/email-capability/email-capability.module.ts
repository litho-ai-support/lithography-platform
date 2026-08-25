// src/modules/common/email-capability/email-capability.module.ts
import { Module } from '@nestjs/common';
import { RuntimeEmailDeliveryCapabilityAnchor } from './email-capability.providers';

@Module({
  providers: [RuntimeEmailDeliveryCapabilityAnchor],
  exports: [RuntimeEmailDeliveryCapabilityAnchor],
})
export class EmailCapabilityModule {}
