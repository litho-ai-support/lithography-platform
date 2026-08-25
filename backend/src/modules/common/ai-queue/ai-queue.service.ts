// src/modules/common/ai-queue/ai-queue.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqProducerGateway } from '@src/infrastructure/bullmq/producer.gateway';
import { CapabilityRuntimeContributionProvider } from '@src/infrastructure/capability/capability.decorators';
import {
  CAPABILITY_STATE_READER,
  type CapabilityStateReader,
} from '@src/modules/common/capability-state-reader.contract';
import { PinoLogger } from 'nestjs-pino';
import type { QueueAiEmbedInput, QueueAiGenerateInput, QueueAiResult } from './ai-queue.types';

@Injectable()
@CapabilityRuntimeContributionProvider({
  capabilityId: 'ai.execution',
  runtimeDependencies: [],
  queueResources: [
    { queueName: BULLMQ_QUEUES.AI, jobName: BULLMQ_JOBS.AI.GENERATE },
    { queueName: BULLMQ_QUEUES.AI, jobName: BULLMQ_JOBS.AI.EMBED },
  ],
})
export class AiQueueService {
  constructor(
    private readonly producer: BullMqProducerGateway,
    private readonly logger: PinoLogger,
    @Inject(CAPABILITY_STATE_READER)
    private readonly capabilityStateReader: CapabilityStateReader,
  ) {
    this.logger.setContext(AiQueueService.name);
  }

  async enqueueGenerate(input: QueueAiGenerateInput): Promise<QueueAiResult> {
    this.capabilityStateReader.requireEnabled('ai.execution');
    const job = await this.producer.enqueue({
      queueName: BULLMQ_QUEUES.AI,
      jobName: BULLMQ_JOBS.AI.GENERATE,
      payload: {
        provider: input.provider,
        model: input.model,
        prompt: input.prompt,
        metadata: input.metadata,
      },
      dedupKey: input.dedupKey,
      traceId: input.traceId,
    });
    this.logger.info(
      {
        model: input.model,
        provider: input.provider,
        jobId: job.jobId,
        traceId: job.traceId,
      },
      'AI generate job accepted',
    );
    return {
      jobId: job.jobId,
      traceId: job.traceId,
    };
  }

  async enqueueEmbed(input: QueueAiEmbedInput): Promise<QueueAiResult> {
    this.capabilityStateReader.requireEnabled('ai.execution');
    const job = await this.producer.enqueue({
      queueName: BULLMQ_QUEUES.AI,
      jobName: BULLMQ_JOBS.AI.EMBED,
      payload: {
        model: input.model,
        text: input.text,
        metadata: input.metadata,
      },
      dedupKey: input.dedupKey,
      traceId: input.traceId,
    });
    this.logger.info(
      {
        model: input.model,
        jobId: job.jobId,
        traceId: job.traceId,
      },
      'AI embed job accepted',
    );
    return {
      jobId: job.jobId,
      traceId: job.traceId,
    };
  }
}
