import { Inject, Injectable } from '@nestjs/common';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqProducerGateway } from '@src/infrastructure/bullmq/producer.gateway';
import { CapabilityRuntimeContributionProvider } from '@src/infrastructure/capability/capability.decorators';
import {
  CAPABILITY_STATE_READER,
  type CapabilityStateReader,
} from '@src/modules/common/capability-state-reader.contract';
import { PinoLogger } from 'nestjs-pino';
import type {
  QueueAiWorkflowInput,
  QueueAiWorkflowJobExistenceInput,
  QueueAiWorkflowJobExistenceResult,
  QueueAiWorkflowQueueHealthResult,
  QueueAiWorkflowResult,
} from './ai-workflow-queue.types';

const BULLMQ_QUEUE_NOT_REGISTERED_ERROR_PREFIX = 'BullMQ queue is not registered:';

@Injectable()
@CapabilityRuntimeContributionProvider({
  capabilityId: 'ai.workflow',
  runtimeDependencies: [],
  queueResources: [{ queueName: BULLMQ_QUEUES.AI_WORKFLOW, jobName: BULLMQ_JOBS.AI.WORKFLOW }],
})
export class AiWorkflowQueueService {
  constructor(
    private readonly producer: BullMqProducerGateway,
    private readonly logger: PinoLogger,
    @Inject(CAPABILITY_STATE_READER)
    private readonly capabilityStateReader: CapabilityStateReader,
  ) {
    this.logger.setContext(AiWorkflowQueueService.name);
  }

  async enqueueWorkflow(input: QueueAiWorkflowInput): Promise<QueueAiWorkflowResult> {
    this.capabilityStateReader.requireEnabled('ai.workflow');
    const job = await this.producer.enqueue({
      queueName: BULLMQ_QUEUES.AI_WORKFLOW,
      jobName: BULLMQ_JOBS.AI.WORKFLOW,
      payload: { workflowId: input.workflowId, traceId: input.traceId },
      explicitJobId: input.jobId,
      traceId: input.traceId,
    });
    this.logger.info(
      { workflowId: input.workflowId, jobId: job.jobId, traceId: job.traceId },
      'AI workflow job accepted',
    );
    return { jobId: job.jobId, traceId: job.traceId };
  }

  async hasWorkflowJob(
    input: QueueAiWorkflowJobExistenceInput,
  ): Promise<QueueAiWorkflowJobExistenceResult> {
    this.capabilityStateReader.requireEnabled('ai.workflow');
    const result = await this.producer.hasJob({
      queueName: BULLMQ_QUEUES.AI_WORKFLOW,
      jobId: input.jobId,
    });
    return { jobId: result.jobId, exists: result.exists };
  }

  async checkWorkflowQueueAvailable(): Promise<QueueAiWorkflowQueueHealthResult> {
    this.capabilityStateReader.requireEnabled('ai.workflow');
    try {
      await this.producer.checkQueueAvailable({ queueName: BULLMQ_QUEUES.AI_WORKFLOW });
      return { available: true };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        error.message.startsWith(BULLMQ_QUEUE_NOT_REGISTERED_ERROR_PREFIX)
      ) {
        throw error;
      }
      return { available: false, reason: 'QUEUE_UNAVAILABLE' };
    }
  }
}
