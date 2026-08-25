// src/usecases/email-worker/consume-email-job.usecase.ts
import { Injectable, Logger } from '@nestjs/common';
import { CAPABILITY_ERROR, isDomainError } from '@src/core/common/errors/domain-error';
import { resolveAsyncTaskBizKey } from '@src/core/common/async-task/async-task-identifier.policy';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AsyncTaskRecordSource } from '@src/modules/async-task-record/async-task-record.types';
import { EmailDeliveryService } from '@src/modules/common/email-worker/email-delivery.service';
import type { SendEmailResult } from '@src/modules/common/email-worker/email-worker.types';
import type {
  ConsumeEmailJobCompleteInput,
  ConsumeEmailJobFailInput,
  ConsumeEmailJobProcessInput,
} from './consume-email-job.types';

@Injectable()
export class ConsumeEmailJobUsecase {
  private readonly logger = new Logger(ConsumeEmailJobUsecase.name);

  constructor(
    private readonly emailDeliveryService: EmailDeliveryService,
    private readonly asyncTaskRecordService: AsyncTaskRecordService,
  ) {}

  async process(input: ConsumeEmailJobProcessInput): Promise<SendEmailResult> {
    await this.recordAuditBestEffort(() =>
      this.asyncTaskRecordService.recordStarted({
        data: {
          queueName: input.queueName,
          jobName: input.jobName,
          jobId: input.jobId,
          traceId: input.traceId,
          bizType: 'email',
          bizKey: resolveAsyncTaskBizKey({
            domain: 'email',
            traceId: input.traceId,
            jobId: input.jobId,
          }),
          source: this.resolveSource(),
          reason: 'worker_processing',
          attemptCount: this.resolveProcessingAttemptCount({ attemptsMade: input.attemptsMade }),
          maxAttempts: input.maxAttempts,
          enqueuedAt: input.enqueuedAt,
          startedAt: input.startedAt,
          occurredAt: input.startedAt,
        },
      }),
    );
    return await this.emailDeliveryService.send(input.payload);
  }

  async complete(input: ConsumeEmailJobCompleteInput): Promise<void> {
    await this.recordAuditBestEffort(() =>
      this.asyncTaskRecordService.recordFinished({
        data: {
          queueName: input.queueName,
          jobName: input.jobName,
          jobId: input.jobId,
          traceId: input.traceId,
          bizType: 'email',
          bizKey: resolveAsyncTaskBizKey({
            domain: 'email',
            traceId: input.traceId,
            jobId: input.jobId,
          }),
          source: this.resolveSource(),
          status: 'succeeded',
          reason: 'worker_completed',
          attemptCount: this.resolveFinalAttemptCount({ attemptsMade: input.attemptsMade }),
          maxAttempts: input.maxAttempts,
          enqueuedAt: input.enqueuedAt,
          startedAt: input.startedAt,
          finishedAt: input.finishedAt,
          occurredAt: input.finishedAt,
        },
      }),
    );
  }

  async fail(input: ConsumeEmailJobFailInput): Promise<void> {
    await this.recordAuditBestEffort(() =>
      this.asyncTaskRecordService.recordFinished({
        data: {
          queueName: input.queueName,
          jobName: input.jobName,
          jobId: input.jobId,
          traceId: input.traceId,
          bizType: 'email',
          bizKey: resolveAsyncTaskBizKey({
            domain: 'email',
            traceId: input.traceId,
            jobId: input.jobId,
          }),
          source: this.resolveSource(),
          status: 'failed',
          reason: input.reason,
          attemptCount: this.resolveFinalAttemptCount({ attemptsMade: input.attemptsMade }),
          maxAttempts: input.maxAttempts,
          enqueuedAt: input.enqueuedAt,
          startedAt: input.startedAt,
          finishedAt: input.finishedAt,
          occurredAt: input.occurredAt ?? input.finishedAt,
        },
      }),
    );
  }

  private async recordAuditBestEffort(operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (error: unknown) {
      if (isDomainError(error) && error.code === CAPABILITY_ERROR.UNAVAILABLE) return;
      this.logger.warn({
        message: 'Optional Async Task audit failed during email delivery',
        error: this.normalizeAuditError(error),
      });
    }
  }

  private normalizeAuditError(error: unknown): { readonly name: string; readonly message: string } {
    if (error instanceof Error) {
      return { name: error.name || 'Error', message: error.message || 'email_audit_failed' };
    }
    return { name: 'Error', message: 'email_audit_failed' };
  }

  private resolveProcessingAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade + 1, 1);
  }

  private resolveFinalAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade, 1);
  }

  private resolveSource(): AsyncTaskRecordSource {
    return 'system';
  }
}
