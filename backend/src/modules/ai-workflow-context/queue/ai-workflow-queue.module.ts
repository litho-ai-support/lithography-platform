import { Module } from '@nestjs/common';
import { BullMqModule } from '@src/infrastructure/bullmq/bullmq.module';
import { AiWorkflowContextModule } from '../ai-workflow-context.module';
import { AiWorkflowQueueService } from './ai-workflow-queue.service';

@Module({
  imports: [AiWorkflowContextModule, BullMqModule],
  providers: [AiWorkflowQueueService],
  exports: [AiWorkflowQueueService],
})
export class AiWorkflowQueueModule {}
