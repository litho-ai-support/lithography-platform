// src/modules/common/ai-capability/ai-capability.module.ts
import { Module } from '@nestjs/common';
import { AiCapabilityAnchor, AiExecutionCapabilityAnchor } from './ai-capability.providers';

@Module({
  providers: [AiCapabilityAnchor, AiExecutionCapabilityAnchor],
  exports: [AiCapabilityAnchor, AiExecutionCapabilityAnchor],
})
export class AiCapabilityModule {}
