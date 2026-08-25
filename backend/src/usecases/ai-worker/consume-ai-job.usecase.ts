// src/usecases/ai-worker/consume-ai-job.usecase.ts
import { Injectable, Logger } from '@nestjs/common';
import { resolveAsyncTaskBizKey } from '@src/core/common/async-task/async-task-identifier.policy';
import { normalizeOptionalText } from '@src/core/common/input-normalize/input-normalize.policy';
import { THIRDPARTY_ERROR, isDomainError } from '@src/core/common/errors/domain-error';
import { AiProviderCallRecordService } from '@src/modules/ai-provider-call-record/ai-provider-call-record.service';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AsyncTaskRecordSource } from '@src/modules/async-task-record/async-task-record.types';
import { AiWorkerService } from '@src/modules/common/ai-worker/ai-worker.service';
import type {
  EmbedAiContentResult,
  GenerateAiContentResult,
} from '@src/modules/common/ai-worker/ai-worker.types';
import type {
  ConsumeAiEmbedJobCompleteInput,
  ConsumeAiEmbedJobFailInput,
  ConsumeAiEmbedJobProcessInput,
  ConsumeAiGenerateJobCompleteInput,
  ConsumeAiGenerateJobFailInput,
  ConsumeAiGenerateJobProcessInput,
} from './consume-ai-job.types';

@Injectable()
export class ConsumeAiGenerateJobUsecase {
  private readonly logger = new Logger(ConsumeAiGenerateJobUsecase.name);

  constructor(
    private readonly aiWorkerService: AiWorkerService,
    private readonly asyncTaskRecordService: AsyncTaskRecordService,
    private readonly aiProviderCallRecordService: AiProviderCallRecordService,
  ) {}

  async process(input: ConsumeAiGenerateJobProcessInput): Promise<GenerateAiContentResult> {
    const asyncTaskRecord = await this.asyncTaskRecordService.recordStarted({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: 'ai_generation',
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_generation',
          traceId: input.traceId,
          jobId: input.jobId,
        }),
        source: this.resolveSource(),
        overwriteExistingSource: true,
        reason: 'worker_processing',
        attemptCount: this.resolveProcessingAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        overwriteExistingMaxAttempts: true,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        occurredAt: input.startedAt,
      },
    });
    const providerStartedAt = input.startedAt ?? new Date();
    try {
      const result = await this.aiWorkerService.generate(input.payload);
      await this.recordGenerateSucceededCall({
        input,
        asyncTaskRecord,
        result,
        fallbackProviderStartedAt: providerStartedAt,
      });
      return result;
    } catch (providerError) {
      if (shouldRecordProviderCallFailure(providerError)) {
        await this.recordGenerateFailedCall({
          input,
          asyncTaskRecord,
          providerError,
          providerStartedAt,
        });
      } else {
        this.logger.warn(
          'skip generate provider failed call record because request was not attempted',
          {
            traceId: input.traceId,
            jobId: input.jobId,
            error: resolveUnknownErrorMessage(providerError),
          },
        );
      }
      throw providerError;
    }
  }

  async complete(input: ConsumeAiGenerateJobCompleteInput): Promise<void> {
    await this.asyncTaskRecordService.recordFinished({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: 'ai_generation',
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_generation',
          traceId: input.traceId,
          jobId: input.jobId,
        }),
        source: this.resolveSource(),
        overwriteExistingSource: true,
        status: 'succeeded',
        reason: 'worker_completed',
        attemptCount: this.resolveFinalAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        overwriteExistingMaxAttempts: true,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        occurredAt: input.finishedAt,
      },
    });
  }

  async fail(input: ConsumeAiGenerateJobFailInput): Promise<void> {
    const bizType = input.bizType ?? 'ai_generation';
    await this.asyncTaskRecordService.recordFinished({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType,
        bizKey:
          input.bizKey ??
          this.resolveGenerateFailBizKey({
            bizType,
            traceId: input.traceId,
            jobId: input.jobId,
          }),
        source: this.resolveSource(),
        overwriteExistingSource: true,
        status: 'failed',
        reason: this.resolveGenerateFailReason({
          bizType,
          reason: input.reason,
        }),
        attemptCount: this.resolveFinalAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        overwriteExistingMaxAttempts: true,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        occurredAt: input.occurredAt ?? input.finishedAt,
      },
    });
  }

  private async recordGenerateSucceededCall(input: {
    readonly input: ConsumeAiGenerateJobProcessInput;
    readonly asyncTaskRecord: Awaited<ReturnType<AsyncTaskRecordService['recordStarted']>>;
    readonly result: GenerateAiContentResult;
    readonly fallbackProviderStartedAt: Date;
  }): Promise<void> {
    const providerFinishedAt = input.result.providerFinishedAt ?? new Date();
    try {
      await this.aiProviderCallRecordService.createRecord({
        data: {
          asyncTaskRecordId: input.asyncTaskRecord.id,
          traceId: input.input.traceId,
          bizType: input.asyncTaskRecord.bizType,
          bizKey: input.asyncTaskRecord.bizKey,
          bizSubKey: input.asyncTaskRecord.bizSubKey,
          source: this.resolveSource(),
          provider: input.result.provider,
          model: input.result.model,
          taskType: 'generate',
          providerRequestId: input.result.providerRequestId ?? input.result.providerJobId,
          providerStatus: 'succeeded',
          promptTokens: input.result.promptTokens ?? null,
          completionTokens: input.result.completionTokens ?? null,
          costAmount: input.result.costAmount ?? null,
          costCurrency: input.result.costCurrency ?? null,
          providerStartedAt: input.result.providerStartedAt ?? input.fallbackProviderStartedAt,
          providerFinishedAt,
        },
      });
    } catch (auditWriteError) {
      this.logger.error('generate provider call record write failed after provider success', {
        traceId: input.input.traceId,
        jobId: input.input.jobId,
        error: resolveUnknownErrorMessage(auditWriteError),
      });
    }
  }

  private async recordGenerateFailedCall(input: {
    readonly input: ConsumeAiGenerateJobProcessInput;
    readonly asyncTaskRecord: Awaited<ReturnType<AsyncTaskRecordService['recordStarted']>>;
    readonly providerError: unknown;
    readonly providerStartedAt: Date;
  }): Promise<void> {
    const providerFinishedAt = new Date();
    const errorContext = resolveProviderErrorContext(input.providerError);
    try {
      await this.aiProviderCallRecordService.createRecord({
        data: {
          asyncTaskRecordId: input.asyncTaskRecord.id,
          traceId: input.input.traceId,
          bizType: input.asyncTaskRecord.bizType,
          bizKey: input.asyncTaskRecord.bizKey,
          bizSubKey: input.asyncTaskRecord.bizSubKey,
          source: this.resolveSource(),
          provider:
            resolveText(errorContext.provider) ??
            resolveText(input.input.payload.provider) ??
            'unknown',
          model: input.input.payload.model,
          taskType: 'generate',
          providerRequestId: null,
          providerStatus: 'failed',
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          costAmount: null,
          costCurrency: null,
          normalizedErrorCode: errorContext.normalizedErrorCode,
          providerErrorCode: errorContext.providerErrorCode,
          errorMessage: errorContext.errorMessage,
          providerStartedAt: input.providerStartedAt,
          providerFinishedAt,
        },
      });
    } catch (auditWriteError) {
      this.logger.error('generate provider failed record write failed', {
        traceId: input.input.traceId,
        jobId: input.input.jobId,
        providerError: resolveUnknownErrorMessage(input.providerError),
        auditWriteError: resolveUnknownErrorMessage(auditWriteError),
      });
    }
  }

  private resolveProcessingAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade + 1, 1);
  }

  private resolveFinalAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade, 1);
  }

  private resolveGenerateFailBizKey(input: {
    readonly bizType: 'ai_generation' | 'ai_worker';
    readonly traceId: string;
    readonly jobId: string;
  }): string {
    if (input.bizType === 'ai_worker') {
      return input.traceId;
    }
    return resolveAsyncTaskBizKey({
      domain: 'ai_generation',
      traceId: input.traceId,
      jobId: input.jobId,
    });
  }

  private resolveGenerateFailReason(input: {
    readonly bizType: 'ai_generation' | 'ai_worker';
    readonly reason?: string;
  }): string {
    const normalizedReason = normalizeWorkerFailReason(input.reason);
    if (input.bizType === 'ai_worker') {
      return normalizedReason;
    }
    if (
      normalizedReason.startsWith('worker_failed:') ||
      normalizedReason.startsWith('missing_payload_trace_id')
    ) {
      return normalizedReason.slice(0, 128);
    }
    const prefix = 'worker_failed:';
    const availableSummaryLength = Math.max(128 - prefix.length, 1);
    const summary = normalizedReason.slice(0, availableSummaryLength);
    return `${prefix}${summary}`;
  }

  private resolveSource(): AsyncTaskRecordSource {
    return 'system';
  }
}

@Injectable()
export class ConsumeAiEmbedJobUsecase {
  private readonly logger = new Logger(ConsumeAiEmbedJobUsecase.name);

  constructor(
    private readonly aiWorkerService: AiWorkerService,
    private readonly asyncTaskRecordService: AsyncTaskRecordService,
    private readonly aiProviderCallRecordService: AiProviderCallRecordService,
  ) {}

  async process(input: ConsumeAiEmbedJobProcessInput): Promise<EmbedAiContentResult> {
    const asyncTaskRecord = await this.asyncTaskRecordService.recordStarted({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: 'ai_embedding',
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_embedding',
          traceId: input.traceId,
          jobId: input.jobId,
        }),
        source: this.resolveSource(),
        overwriteExistingSource: true,
        reason: 'worker_processing',
        attemptCount: this.resolveProcessingAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        overwriteExistingMaxAttempts: true,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        occurredAt: input.startedAt,
      },
    });
    const providerStartedAt = input.startedAt ?? new Date();
    try {
      const result = await this.aiWorkerService.embed(input.payload);
      await this.recordEmbedSucceededCall({
        input,
        asyncTaskRecord,
        result,
        fallbackProviderStartedAt: providerStartedAt,
      });
      return result;
    } catch (providerError) {
      if (shouldRecordProviderCallFailure(providerError)) {
        await this.recordEmbedFailedCall({
          input,
          asyncTaskRecord,
          providerError,
          providerStartedAt,
        });
      } else {
        this.logger.warn(
          'skip embed provider failed call record because request was not attempted',
          {
            traceId: input.traceId,
            jobId: input.jobId,
            error: resolveUnknownErrorMessage(providerError),
          },
        );
      }
      throw providerError;
    }
  }

  async complete(input: ConsumeAiEmbedJobCompleteInput): Promise<void> {
    await this.asyncTaskRecordService.recordFinished({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: 'ai_embedding',
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_embedding',
          traceId: input.traceId,
          jobId: input.jobId,
        }),
        source: this.resolveSource(),
        overwriteExistingSource: true,
        status: 'succeeded',
        reason: 'worker_completed',
        attemptCount: this.resolveFinalAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        overwriteExistingMaxAttempts: true,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        occurredAt: input.finishedAt,
      },
    });
  }

  async fail(input: ConsumeAiEmbedJobFailInput): Promise<void> {
    const bizType = input.bizType ?? 'ai_embedding';
    await this.asyncTaskRecordService.recordFinished({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType,
        bizKey:
          input.bizKey ??
          this.resolveEmbedFailBizKey({
            bizType,
            traceId: input.traceId,
            jobId: input.jobId,
          }),
        source: this.resolveSource(),
        overwriteExistingSource: true,
        status: 'failed',
        reason: this.resolveEmbedFailReason({
          bizType,
          reason: input.reason,
        }),
        attemptCount: this.resolveFinalAttemptCount({ attemptsMade: input.attemptsMade }),
        maxAttempts: input.maxAttempts,
        overwriteExistingMaxAttempts: true,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        occurredAt: input.occurredAt ?? input.finishedAt,
      },
    });
  }

  private async recordEmbedSucceededCall(input: {
    readonly input: ConsumeAiEmbedJobProcessInput;
    readonly asyncTaskRecord: Awaited<ReturnType<AsyncTaskRecordService['recordStarted']>>;
    readonly result: EmbedAiContentResult;
    readonly fallbackProviderStartedAt: Date;
  }): Promise<void> {
    const providerFinishedAt = input.result.providerFinishedAt ?? new Date();
    try {
      await this.aiProviderCallRecordService.createRecord({
        data: {
          asyncTaskRecordId: input.asyncTaskRecord.id,
          traceId: input.input.traceId,
          bizType: input.asyncTaskRecord.bizType,
          bizKey: input.asyncTaskRecord.bizKey,
          bizSubKey: input.asyncTaskRecord.bizSubKey,
          source: this.resolveSource(),
          provider: input.result.provider,
          model: input.result.model,
          taskType: 'embed',
          providerRequestId: input.result.providerRequestId ?? input.result.providerJobId,
          providerStatus: 'succeeded',
          promptTokens: input.result.promptTokens ?? null,
          completionTokens: input.result.completionTokens ?? null,
          costAmount: input.result.costAmount ?? null,
          costCurrency: input.result.costCurrency ?? null,
          providerStartedAt: input.result.providerStartedAt ?? input.fallbackProviderStartedAt,
          providerFinishedAt,
        },
      });
    } catch (auditWriteError) {
      this.logger.error('embed provider call record write failed after provider success', {
        traceId: input.input.traceId,
        jobId: input.input.jobId,
        error: resolveUnknownErrorMessage(auditWriteError),
      });
    }
  }

  private async recordEmbedFailedCall(input: {
    readonly input: ConsumeAiEmbedJobProcessInput;
    readonly asyncTaskRecord: Awaited<ReturnType<AsyncTaskRecordService['recordStarted']>>;
    readonly providerError: unknown;
    readonly providerStartedAt: Date;
  }): Promise<void> {
    const providerFinishedAt = new Date();
    const errorContext = resolveProviderErrorContext(input.providerError);
    try {
      await this.aiProviderCallRecordService.createRecord({
        data: {
          asyncTaskRecordId: input.asyncTaskRecord.id,
          traceId: input.input.traceId,
          bizType: input.asyncTaskRecord.bizType,
          bizKey: input.asyncTaskRecord.bizKey,
          bizSubKey: input.asyncTaskRecord.bizSubKey,
          source: this.resolveSource(),
          provider: resolveText(errorContext.provider) ?? 'mock',
          model: input.input.payload.model,
          taskType: 'embed',
          providerRequestId: null,
          providerStatus: 'failed',
          promptTokens: null,
          completionTokens: null,
          totalTokens: null,
          costAmount: null,
          costCurrency: null,
          normalizedErrorCode: errorContext.normalizedErrorCode,
          providerErrorCode: errorContext.providerErrorCode,
          errorMessage: errorContext.errorMessage,
          providerStartedAt: input.providerStartedAt,
          providerFinishedAt,
        },
      });
    } catch (auditWriteError) {
      this.logger.error('embed provider failed record write failed', {
        traceId: input.input.traceId,
        jobId: input.input.jobId,
        providerError: resolveUnknownErrorMessage(input.providerError),
        auditWriteError: resolveUnknownErrorMessage(auditWriteError),
      });
    }
  }

  private resolveProcessingAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade + 1, 1);
  }

  private resolveFinalAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade, 1);
  }

  private resolveEmbedFailBizKey(input: {
    readonly bizType: 'ai_embedding' | 'ai_worker';
    readonly traceId: string;
    readonly jobId: string;
  }): string {
    if (input.bizType === 'ai_worker') {
      return input.traceId;
    }
    return resolveAsyncTaskBizKey({
      domain: 'ai_embedding',
      traceId: input.traceId,
      jobId: input.jobId,
    });
  }

  private resolveEmbedFailReason(input: {
    readonly bizType: 'ai_embedding' | 'ai_worker';
    readonly reason?: string;
  }): string {
    const normalizedReason = normalizeWorkerFailReason(input.reason);
    if (input.bizType === 'ai_worker') {
      return normalizedReason;
    }
    if (
      normalizedReason.startsWith('worker_failed:') ||
      normalizedReason.startsWith('missing_payload_trace_id')
    ) {
      return normalizedReason.slice(0, 128);
    }
    const prefix = 'worker_failed:';
    const availableSummaryLength = Math.max(128 - prefix.length, 1);
    const summary = normalizedReason.slice(0, availableSummaryLength);
    return `${prefix}${summary}`;
  }

  private resolveSource(): AsyncTaskRecordSource {
    return 'system';
  }
}

function normalizeWorkerFailReason(reason?: string): string {
  return (
    normalizeOptionalText(reason, 'to_undefined', { fieldName: 'worker_reason' }) ??
    'worker_unknown_error'
  );
}

function resolveText(value: string | undefined | null): string | undefined {
  const normalized = normalizeOptionalText(value, 'to_undefined');
  return normalized ?? undefined;
}

function resolveProviderErrorContext(error: unknown): {
  readonly provider?: string;
  readonly normalizedErrorCode: string;
  readonly providerErrorCode: string | null;
  readonly errorMessage: string;
} {
  if (isDomainError(error)) {
    const details = resolveObject(error.details);
    const provider = resolveText(resolveString(details?.provider));
    const providerErrorCode = resolveText(resolveString(details?.providerErrorCode)) ?? null;
    return {
      provider,
      normalizedErrorCode: resolveText(error.message) ?? 'ai_provider_unknown_error',
      providerErrorCode,
      errorMessage: resolveText(error.message) ?? 'ai_provider_unknown_error',
    };
  }
  if (error instanceof Error) {
    const message = resolveText(error.message) ?? 'ai_provider_unknown_error';
    return {
      normalizedErrorCode: message,
      providerErrorCode: null,
      errorMessage: message,
    };
  }
  return {
    normalizedErrorCode: 'ai_provider_unknown_error',
    providerErrorCode: null,
    errorMessage: 'ai_provider_unknown_error',
  };
}

function resolveObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function resolveString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  return value;
}

function resolveUnknownErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return 'unknown_error';
}

function shouldRecordProviderCallFailure(error: unknown): boolean {
  if (!isDomainError(error)) {
    return false;
  }
  return error.code === THIRDPARTY_ERROR.PROVIDER_API_ERROR;
}
