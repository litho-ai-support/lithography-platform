import { Module } from '@nestjs/common';
import { AiWorkflowWorkerUsecasesModule } from '@src/usecases/ai-worker/ai-workflow-worker-usecases.module';
import { AiWorkflowJobHandler } from './ai-workflow-job.handler';
import { AiWorkflowJobProcessor } from './ai-workflow-job.processor';

@Module({
  imports: [AiWorkflowWorkerUsecasesModule],
  providers: [AiWorkflowJobHandler, AiWorkflowJobProcessor],
})
export class AiWorkflowWorkerAdapterModule {}
