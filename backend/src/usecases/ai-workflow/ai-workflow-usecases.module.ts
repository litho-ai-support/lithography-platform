import { Module } from '@nestjs/common';
import { AiWorkflowContextModule } from '@src/modules/ai-workflow-context/ai-workflow-context.module';
import { AiWorkflowQueueModule } from '@src/modules/ai-workflow-context/queue/ai-workflow-queue.module';
import { AsyncTaskRecordModule } from '@src/modules/async-task-record/async-task-record.module';
import { CreateAndAdmitAiWorkflowUsecase } from './create-and-admit-ai-workflow.usecase';
import { RunAiWorkflowHousekeepingUsecase } from './run-ai-workflow-housekeeping.usecase';

@Module({
  imports: [AiWorkflowContextModule, AiWorkflowQueueModule, AsyncTaskRecordModule],
  providers: [CreateAndAdmitAiWorkflowUsecase, RunAiWorkflowHousekeepingUsecase],
  exports: [CreateAndAdmitAiWorkflowUsecase, RunAiWorkflowHousekeepingUsecase],
})
export class AiWorkflowUsecasesModule {}
