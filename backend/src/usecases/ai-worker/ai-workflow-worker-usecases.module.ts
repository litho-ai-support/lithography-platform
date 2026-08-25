import { Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { AiProviderCallRecordModule } from '@src/modules/ai-provider-call-record/ai-provider-call-record.module';
import { AiWorkflowContextModule } from '@src/modules/ai-workflow-context/ai-workflow-context.module';
import { AiWorkflowQueueModule } from '@src/modules/ai-workflow-context/queue/ai-workflow-queue.module';
import { AsyncTaskRecordModule } from '@src/modules/async-task-record/async-task-record.module';
import { AiWorkerModule } from '@src/modules/common/ai-worker/ai-worker.module';
import { AiWorkflowHandlerRegistry } from './ai-workflow-handler.registry';
import { AiWorkflowWorkerActivationUsecase } from './ai-workflow-worker-activation.usecase';
import { ConsumeAiWorkflowJobUsecase } from './consume-ai-workflow-job.usecase';
import { GenericTextGenerateWorkflowHandler } from './generic-text-generate-workflow.handler';

@Module({
  imports: [
    DiscoveryModule,
    AiWorkerModule,
    AsyncTaskRecordModule,
    AiProviderCallRecordModule,
    AiWorkflowContextModule,
    AiWorkflowQueueModule,
  ],
  providers: [
    ConsumeAiWorkflowJobUsecase,
    AiWorkflowHandlerRegistry,
    GenericTextGenerateWorkflowHandler,
    AiWorkflowWorkerActivationUsecase,
  ],
  exports: [AiWorkflowWorkerActivationUsecase, ConsumeAiWorkflowJobUsecase],
})
export class AiWorkflowWorkerUsecasesModule {}
