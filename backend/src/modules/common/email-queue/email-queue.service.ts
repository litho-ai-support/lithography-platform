// src/modules/common/email-queue/email-queue.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqProducerGateway } from '@src/infrastructure/bullmq/producer.gateway';
import { CapabilityRuntimeContributionProvider } from '@src/infrastructure/capability/capability.decorators';
import {
  CAPABILITY_STATE_READER,
  type CapabilityStateReader,
} from '@src/modules/common/capability-state-reader.contract';
import { PinoLogger } from 'nestjs-pino';
import type { QueueEmailInput, QueueEmailResult } from './email-queue.types';

@Injectable()
@CapabilityRuntimeContributionProvider({
  capabilityId: 'runtime.email-delivery',
  runtimeDependencies: [{ capabilityId: 'runtime.async-task', requirement: 'optional' }],
  queueResources: [{ queueName: BULLMQ_QUEUES.EMAIL, jobName: BULLMQ_JOBS.EMAIL.SEND }],
})
export class EmailQueueService {
  constructor(
    private readonly producer: BullMqProducerGateway,
    private readonly logger: PinoLogger,
    @Inject(CAPABILITY_STATE_READER)
    private readonly capabilityStateReader: CapabilityStateReader,
  ) {
    this.logger.setContext(EmailQueueService.name);
  }

  async enqueueSend(input: QueueEmailInput): Promise<QueueEmailResult> {
    this.capabilityStateReader.requireEnabled('runtime.email-delivery');
    const job = await this.producer.enqueue({
      queueName: BULLMQ_QUEUES.EMAIL,
      jobName: BULLMQ_JOBS.EMAIL.SEND,
      payload: {
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        templateId: input.templateId,
        meta: input.meta,
      },
      dedupKey: input.dedupKey,
      traceId: input.traceId,
    });
    this.logger.info(
      {
        to: this.maskEmail(input.to),
        jobId: job.jobId,
        traceId: job.traceId,
      },
      'Email job accepted',
    );
    return {
      jobId: job.jobId,
      traceId: job.traceId,
    };
  }

  private maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '***';
    const [localPart, domainPart] = parts;
    if (localPart.length <= 2) {
      return `${localPart.charAt(0) || '*'}***@${domainPart}`;
    }
    return `${localPart.slice(0, 2)}***@${domainPart}`;
  }
}
