// src/adapters/worker/ai/ai-worker-adapter.module.ts
import { Module } from '@nestjs/common';
import { AiWorkerUsecasesModule } from '@src/usecases/ai-worker/ai-worker-usecases.module';
import { AiJobHandler } from './ai-job.handler';
import { AiJobProcessor } from './ai-job.processor';

@Module({
  imports: [AiWorkerUsecasesModule],
  providers: [AiJobHandler, AiJobProcessor],
})
export class AiWorkerAdapterModule {}
