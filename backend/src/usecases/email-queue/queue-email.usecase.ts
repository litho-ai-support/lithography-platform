// src/usecases/email-queue/queue-email.usecase.ts
import { Injectable, Logger } from '@nestjs/common';
import {
  CAPABILITY_ERROR,
  DomainError,
  INPUT_NORMALIZE_ERROR,
  isDomainError,
} from '@src/core/common/errors/domain-error';
import {
  normalizeOptionalText,
  normalizeRequiredText,
} from '@src/core/common/input-normalize/input-normalize.policy';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AsyncTaskRecordSource } from '@src/modules/async-task-record/async-task-record.types';
import { EmailQueueService } from '@src/modules/common/email-queue/email-queue.service';
import type {
  QueueEmailInput,
  QueueEmailResult,
} from '@src/modules/common/email-queue/email-queue.types';
import {
  resolveAsyncTaskBizKey,
  resolveEnqueueFailureIdentifiers,
} from '@src/core/common/async-task/async-task-identifier.policy';
import type { QueueEmailUsecaseInput, QueueEmailUsecaseResult } from './queue-email.types';

@Injectable()
export class QueueEmailUsecase {
  private readonly logger = new Logger(QueueEmailUsecase.name);

  constructor(
    private readonly emailQueueService: EmailQueueService,
    private readonly asyncTaskRecordService: AsyncTaskRecordService,
  ) {}

  async execute(input: QueueEmailUsecaseInput): Promise<QueueEmailUsecaseResult> {
    const normalizedInput = this.normalizeInput(input);
    const occurredAt = new Date();
    const result = await this.enqueueOrThrow({ input: normalizedInput, occurredAt });
    await this.recordAuditBestEffort(() =>
      this.asyncTaskRecordService.recordEnqueued({
        data: {
          queueName: 'email',
          jobName: 'send',
          jobId: result.jobId,
          traceId: result.traceId,
          bizType: 'email',
          bizKey: resolveAsyncTaskBizKey({
            domain: 'email',
            traceId: result.traceId,
            jobId: result.jobId,
            dedupKey: normalizedInput.dedupKey,
          }),
          source: this.resolveSource(),
          reason: 'enqueue_accepted',
          occurredAt,
          dedupKey: normalizedInput.dedupKey,
        },
      }),
    );
    return result;
  }

  private normalizeInput(input: QueueEmailUsecaseInput): QueueEmailInput {
    return {
      to: this.normalizeRequiredInput(input.to, '收件邮箱'),
      subject: this.normalizeRequiredInput(input.subject, '邮件主题'),
      text: this.normalizeOptionalInput(input.text, '纯文本内容'),
      html: this.normalizeOptionalInput(input.html, 'HTML 内容'),
      templateId: this.normalizeOptionalInput(input.templateId, '模板 ID'),
      meta: input.meta ?? undefined,
      dedupKey: this.normalizeOptionalInput(input.dedupKey, '幂等键'),
      traceId: this.normalizeOptionalInput(input.traceId, '链路追踪 ID'),
    };
  }

  private normalizeOptionalInput(input: unknown, fieldName: string): string | undefined {
    return (
      normalizeOptionalText(input === null ? undefined : input, 'to_undefined', { fieldName }) ??
      undefined
    );
  }

  private normalizeRequiredInput(input: unknown, fieldName: string): string {
    try {
      return normalizeRequiredText(input, { fieldName });
    } catch (error: unknown) {
      if (isDomainError(error) && error.code === INPUT_NORMALIZE_ERROR.REQUIRED_TEXT_EMPTY) {
        throw new DomainError(error.code, `${fieldName}不能为空`, error.details, error);
      }
      throw error;
    }
  }

  private async enqueueOrThrow(input: {
    readonly input: QueueEmailInput;
    readonly occurredAt: Date;
  }): Promise<QueueEmailResult> {
    try {
      return await this.emailQueueService.enqueueSend(input.input);
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error('email_enqueue_failed');
      const identifiers = resolveEnqueueFailureIdentifiers({
        domain: 'email',
        traceId: input.input.traceId,
        occurredAt: input.occurredAt,
        dedupKey: input.input.dedupKey,
        traceIdPrefix: 'email-enqueue:',
      });
      await this.recordAuditBestEffort(() =>
        this.asyncTaskRecordService.recordEnqueueFailed({
          data: {
            queueName: 'email',
            jobName: 'send',
            jobId: identifiers.failedJobId,
            traceId: identifiers.traceId,
            bizType: 'email',
            bizKey: identifiers.bizKey,
            source: this.resolveSource(),
            reason: normalizedError.message.slice(0, 128),
            occurredAt: input.occurredAt,
            dedupKey: input.input.dedupKey,
          },
        }),
      );
      throw normalizedError;
    }
  }

  private async recordAuditBestEffort(operation: () => Promise<unknown>): Promise<void> {
    try {
      await operation();
    } catch (error: unknown) {
      if (isDomainError(error) && error.code === CAPABILITY_ERROR.UNAVAILABLE) return;
      this.logger.warn({
        message: 'Optional Async Task audit failed during email admission',
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

  private resolveSource(): AsyncTaskRecordSource {
    return 'user_action';
  }
}
