// src/modules/common/ai-queue/ai-queue.module.ts
import { Module } from '@nestjs/common';
import { BullMqModule } from '@src/infrastructure/bullmq/bullmq.module';
import { AiCapabilityModule } from '../ai-capability/ai-capability.module';
import { AiQueueService } from './ai-queue.service';

@Module({
  imports: [AiCapabilityModule, BullMqModule],
  providers: [AiQueueService],
  exports: [AiQueueService],
})
export class AiQueueModule {}
