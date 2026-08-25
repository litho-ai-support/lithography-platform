// src/usecases/email-queue/email-queue-usecases.module.ts
import { Module } from '@nestjs/common';
import { AsyncTaskRecordModule } from '@src/modules/async-task-record/async-task-record.module';
import { EmailQueueModule } from '@src/modules/common/email-queue/email-queue.module';
import { QueueEmailUsecase } from './queue-email.usecase';

@Module({
  imports: [EmailQueueModule, AsyncTaskRecordModule],
  providers: [QueueEmailUsecase],
  exports: [QueueEmailUsecase],
})
export class EmailQueueUsecasesModule {}
