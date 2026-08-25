import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { AiWorkflowWorkerActivationUsecase } from '@src/usecases/ai-worker/ai-workflow-worker-activation.usecase';
import { isAiWorkflowNonRetryableError } from '@src/usecases/ai-worker/ai-workflow-worker-errors';
import { UnrecoverableError } from 'bullmq';
import { AiWorkflowJobHandler } from './ai-workflow-job.handler';
import {
  type AiWorkflowFailedJob,
  type AiWorkflowJob,
  type AiWorkflowResult,
  AI_WORKFLOW_QUEUE_NAME,
} from './ai-workflow-job.mapper';

@Injectable()
@Processor(AI_WORKFLOW_QUEUE_NAME, { autorun: false })
export class AiWorkflowJobProcessor extends WorkerHost implements OnApplicationBootstrap {
  private readonly logger = new Logger(AiWorkflowJobProcessor.name);

  constructor(
    private readonly handler: AiWorkflowJobHandler,
    private readonly workerActivation: AiWorkflowWorkerActivationUsecase,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    if (!this.workerActivation.shouldRun()) return;
    void this.worker.run().catch((error: unknown) => {
      this.logger.error(
        'AI Workflow BullMQ Worker stopped unexpectedly',
        error instanceof Error ? error.stack : undefined,
      );
    });
  }

  async process(job: AiWorkflowJob): Promise<AiWorkflowResult> {
    try {
      return await this.handler.process({ job });
    } catch (error: unknown) {
      if (isAiWorkflowNonRetryableError(error)) throw new UnrecoverableError(error.message);
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  async onCompleted(job: AiWorkflowJob): Promise<void> {
    await this.handler.onCompleted({ job });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: AiWorkflowFailedJob | undefined, error: Error): Promise<void> {
    await this.handler.onFailed({ job, error });
  }
}
