// src/usecases/ai-queue/ai-queue-usecases.module.ts
import { Module } from '@nestjs/common';
import { AsyncTaskRecordModule } from '@src/modules/async-task-record/async-task-record.module';
import { AiQueueModule } from '@src/modules/common/ai-queue/ai-queue.module';
import { QueueAiUsecase } from './queue-ai.usecase';

@Module({
  imports: [AiQueueModule, AsyncTaskRecordModule],
  providers: [QueueAiUsecase],
  exports: [QueueAiUsecase],
})
export class AiQueueUsecasesModule {}
