import { Inject, Injectable, Logger } from '@nestjs/common';
import { resolveAsyncTaskBizKey } from '@src/core/common/async-task/async-task-identifier.policy';
import { THIRDPARTY_ERROR, isDomainError } from '@src/core/common/errors/domain-error';
import { normalizeOptionalText } from '@src/core/common/input-normalize/input-normalize.policy';
import { AiProviderCallRecordService } from '@src/modules/ai-provider-call-record/ai-provider-call-record.service';
import { AiWorkflowContextService } from '@src/modules/ai-workflow-context/ai-workflow-context.service';
import {
  AI_WORKFLOW_ASYNC_TASK_BIZ_TYPE,
  type AiWorkflowContextView,
} from '@src/modules/ai-workflow-context/ai-workflow-context.types';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type {
  AsyncTaskRecordSource,
  AsyncTaskRecordTerminalStatus,
} from '@src/modules/async-task-record/async-task-record.types';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '@src/usecases/common/ports/transaction-runner.contract';
import { AiWorkflowHandlerRegistry } from './ai-workflow-handler.registry';
import type { AiWorkflowGenerateProviderCallResult } from './ai-workflow-handler.types';
import {
  AiWorkflowNonRetryableError,
  isAiWorkflowNonRetryableError,
} from './ai-workflow-worker-errors';
import type {
  ConsumeAiWorkflowJobCompleteInput,
  ConsumeAiWorkflowJobFailInput,
  ConsumeAiWorkflowJobProcessInput,
  ConsumeAiWorkflowJobProcessResult,
} from './consume-ai-workflow-job.types';

export const AI_WORKFLOW_WORKER_PROCESSING_TIMEOUT_MS = 15 * 60 * 1000;

@Injectable()
export class ConsumeAiWorkflowJobUsecase {
  private readonly logger = new Logger(ConsumeAiWorkflowJobUsecase.name);

  constructor(
    private readonly aiWorkflowContextService: AiWorkflowContextService,
    private readonly asyncTaskRecordService: AsyncTaskRecordService,
    private readonly aiProviderCallRecordService: AiProviderCallRecordService,
    private readonly handlerRegistry: AiWorkflowHandlerRegistry,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactionRunner: TransactionRunner,
  ) {}

  async process(
    input: ConsumeAiWorkflowJobProcessInput,
  ): Promise<ConsumeAiWorkflowJobProcessResult> {
    const context = await this.loadContextOrThrow(input);
    this.assertJobMatchesContext({ input, context });
    if (context.status === 'SUCCEEDED') {
      return this.buildAcceptedResult(input);
    }
    if (context.status === 'FAILED' || context.status === 'CANCELLED') {
      throw new AiWorkflowNonRetryableError(
        'workflow_already_terminal',
        'WORKFLOW_ALREADY_TERMINAL',
      );
    }

    const processingResult = await this.aiWorkflowContextService.markProcessingForWorker({
      workflowId: input.workflowId,
      jobId: input.jobId,
      now: input.startedAt ?? new Date(),
      processingTimeoutMs: AI_WORKFLOW_WORKER_PROCESSING_TIMEOUT_MS,
    });
    if (processingResult.status === 'CONFLICT') {
      return this.handleProcessingConflict({
        input,
        context: processingResult.context,
      });
    }

    const processingContext = processingResult.context;
    const asyncTaskRecord = await this.asyncTaskRecordService.recordStarted({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        actorAccountId: processingContext.actorAccountId,
        actorActiveRole: processingContext.actorActiveRole,
        bizType: AI_WORKFLOW_ASYNC_TASK_BIZ_TYPE,
        bizKey: this.resolveWorkflowAsyncBizKey({
          traceId: input.traceId,
          jobId: input.jobId,
        }),
        source: this.resolveSource(),
        overwriteExistingSource: true,
        reason: 'worker_processing',
        attemptCount: this.resolveProcessingAttemptCount(input),
        maxAttempts: input.maxAttempts,
        overwriteExistingMaxAttempts: true,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        occurredAt: input.startedAt,
      },
    });

    try {
      const inputPayload = await this.readPresentInputPayload(input.workflowId);
      const handler = this.handlerRegistry.getHandler(processingContext.workflowType);
      const handlerResult = await handler.handle({
        context: processingContext,
        inputPayload,
      });
      if (handlerResult.providerCall) {
        await this.recordProviderSucceededCall({
          context: processingContext,
          asyncTaskRecordId: asyncTaskRecord.id,
          traceId: input.traceId,
          providerCall: handlerResult.providerCall,
        });
      }

      const succeeded = await this.transactionRunner.run(async (transactionContext) => {
        const outputResult = await this.aiWorkflowContextService.writeOutputPayloadForWorker({
          workflowId: input.workflowId,
          jobId: input.jobId,
          outputPayload: handlerResult.outputPayload,
          expectedStatuses: ['PROCESSING'],
          transactionContext,
        });
        if (outputResult.status === 'CONFLICT') {
          return outputResult;
        }
        return await this.aiWorkflowContextService.markSucceededForWorker({
          workflowId: input.workflowId,
          jobId: input.jobId,
          transactionContext,
        });
      });
      if (succeeded.status === 'CONFLICT') {
        throw new AiWorkflowNonRetryableError(
          'workflow_success_state_conflict',
          'WORKFLOW_SUCCESS_STATE_CONFLICT',
        );
      }
      return this.buildAcceptedResult(input);
    } catch (error: unknown) {
      await this.handleProcessError({
        input,
        context: processingContext,
        asyncTaskRecordId: asyncTaskRecord.id,
        error,
      });
      throw error;
    }
  }

  async complete(input: ConsumeAiWorkflowJobCompleteInput): Promise<void> {
    await this.asyncTaskRecordService.recordFinished({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: AI_WORKFLOW_ASYNC_TASK_BIZ_TYPE,
        bizKey: this.resolveWorkflowAsyncBizKey({
          traceId: input.traceId,
          jobId: input.jobId,
        }),
        source: this.resolveSource(),
        overwriteExistingSource: true,
        status: 'succeeded',
        reason: 'worker_completed',
        attemptCount: this.resolveFinalAttemptCount(input),
        maxAttempts: input.maxAttempts,
        overwriteExistingMaxAttempts: true,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        occurredAt: input.finishedAt,
      },
    });
  }

  async fail(input: ConsumeAiWorkflowJobFailInput): Promise<void> {
    const context = await this.aiWorkflowContextService.findByWorkflowId({
      workflowId: input.workflowId,
    });
    const status = this.resolveFailureRecordStatus({ context, jobId: input.jobId });
    await this.asyncTaskRecordService.recordFinished({
      data: {
        queueName: input.queueName,
        jobName: input.jobName,
        jobId: input.jobId,
        traceId: input.traceId,
        bizType: AI_WORKFLOW_ASYNC_TASK_BIZ_TYPE,
        bizKey: this.resolveWorkflowAsyncBizKey({
          traceId: input.traceId,
          jobId: input.jobId,
        }),
        source: this.resolveSource(),
        overwriteExistingSource: true,
        status,
        reason: this.resolveWorkerTerminalReason({ status, reason: input.reason }),
        attemptCount: this.resolveFinalAttemptCount(input),
        maxAttempts: input.maxAttempts,
        overwriteExistingMaxAttempts: true,
        enqueuedAt: input.enqueuedAt,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        occurredAt: input.occurredAt ?? input.finishedAt,
      },
    });

    if (isProcessingStateConflictFailure(input.reason ?? input.error)) {
      return;
    }
    if (!context || context.jobId !== input.jobId || context.status !== 'PROCESSING') {
      return;
    }
    if (this.isFinalAttempt(input)) {
      await this.aiWorkflowContextService.markFailedForWorker({
        workflowId: input.workflowId,
        jobId: input.jobId,
        errorCode: 'WORKFLOW_WORKER_FAILED',
        errorMessage: this.resolveWorkerFailedReason(input.reason),
      });
      return;
    }
    await this.aiWorkflowContextService.releaseProcessingForRetry({
      workflowId: input.workflowId,
      jobId: input.jobId,
    });
  }

  private async handleProcessError(input: {
    readonly input: ConsumeAiWorkflowJobProcessInput;
    readonly context: AiWorkflowContextView;
    readonly asyncTaskRecordId: number;
    readonly error: unknown;
  }): Promise<void> {
    if (isAiWorkflowNonRetryableError(input.error)) {
      if (input.error.providerCall) {
        await this.recordProviderSucceededCall({
          context: input.context,
          asyncTaskRecordId: input.asyncTaskRecordId,
          traceId: input.input.traceId,
          providerCall: input.error.providerCall,
        });
      }
      await this.markProcessingFailed({
        input: input.input,
        errorCode: input.error.reason,
        errorMessage: input.error.message,
      });
      return;
    }

    if (shouldRecordProviderCallFailure(input.error)) {
      await this.recordProviderFailedCall({
        context: input.context,
        asyncTaskRecordId: input.asyncTaskRecordId,
        traceId: input.input.traceId,
        providerError: input.error,
        providerStartedAt: input.input.startedAt ?? new Date(),
      });
    }
    if (this.isFinalAttempt(input.input)) {
      await this.markProcessingFailed({
        input: input.input,
        errorCode: 'WORKFLOW_PROVIDER_FAILED',
        errorMessage: sanitizeErrorMessage(input.error),
      });
      return;
    }
    await this.aiWorkflowContextService.releaseProcessingForRetry({
      workflowId: input.input.workflowId,
      jobId: input.input.jobId,
    });
  }

  private async markProcessingFailed(input: {
    readonly input: ConsumeAiWorkflowJobProcessInput;
    readonly errorCode: string;
    readonly errorMessage: string;
  }): Promise<void> {
    await this.aiWorkflowContextService.markFailedForWorker({
      workflowId: input.input.workflowId,
      jobId: input.input.jobId,
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
    });
  }

  private async readPresentInputPayload(workflowId: string) {
    const inputPayload = await this.aiWorkflowContextService.readInputPayload({ workflowId });
    if (inputPayload.kind !== 'PRESENT') {
      throw new AiWorkflowNonRetryableError(
        'workflow_input_payload_not_present',
        'WORKFLOW_INPUT_PAYLOAD_NOT_PRESENT',
      );
    }
    return inputPayload.payload;
  }

  private async loadContextOrThrow(
    input: ConsumeAiWorkflowJobProcessInput,
  ): Promise<AiWorkflowContextView> {
    const context = await this.aiWorkflowContextService.findByWorkflowId({
      workflowId: input.workflowId,
    });
    if (!context) {
      throw new AiWorkflowNonRetryableError('workflow_context_not_found', 'WORKFLOW_NOT_FOUND');
    }
    return context;
  }

  private assertJobMatchesContext(input: {
    readonly input: ConsumeAiWorkflowJobProcessInput;
    readonly context: AiWorkflowContextView;
  }): void {
    if (
      input.context.jobId !== input.input.jobId ||
      input.context.traceId !== input.input.traceId
    ) {
      throw new AiWorkflowNonRetryableError('workflow_job_mismatch', 'WORKFLOW_JOB_MISMATCH');
    }
  }

  private handleProcessingConflict(input: {
    readonly input: ConsumeAiWorkflowJobProcessInput;
    readonly context: AiWorkflowContextView | null;
  }): ConsumeAiWorkflowJobProcessResult {
    if (input.context?.status === 'SUCCEEDED') {
      return this.buildAcceptedResult(input.input);
    }
    if (input.context?.status === 'FAILED' || input.context?.status === 'CANCELLED') {
      throw new AiWorkflowNonRetryableError(
        'workflow_already_terminal',
        'WORKFLOW_ALREADY_TERMINAL',
      );
    }
    throw new AiWorkflowNonRetryableError(
      'workflow_processing_state_conflict',
      'WORKFLOW_PROCESSING_STATE_CONFLICT',
    );
  }

  private async recordProviderSucceededCall(input: {
    readonly context: AiWorkflowContextView;
    readonly asyncTaskRecordId: number;
    readonly traceId: string;
    readonly providerCall: AiWorkflowGenerateProviderCallResult;
  }): Promise<void> {
    const providerFinishedAt = input.providerCall.result.providerFinishedAt ?? new Date();
    try {
      await this.aiProviderCallRecordService.createRecord({
        data: {
          asyncTaskRecordId: input.asyncTaskRecordId,
          traceId: input.traceId,
          bizType: input.context.bizType,
          bizKey: input.context.bizKey,
          bizSubKey: input.context.bizSubKey,
          source: this.resolveSource(),
          provider: input.providerCall.result.provider,
          model: input.providerCall.result.model,
          taskType: input.providerCall.taskType,
          providerRequestId:
            input.providerCall.result.providerRequestId ?? input.providerCall.result.providerJobId,
          providerStatus: 'succeeded',
          promptTokens: input.providerCall.result.promptTokens ?? null,
          completionTokens: input.providerCall.result.completionTokens ?? null,
          costAmount: input.providerCall.result.costAmount ?? null,
          costCurrency: input.providerCall.result.costCurrency ?? null,
          providerStartedAt:
            input.providerCall.result.providerStartedAt ??
            input.providerCall.providerStartedAtFallback,
          providerFinishedAt,
        },
      });
    } catch (auditWriteError) {
      this.logger.error('workflow provider success call record write failed', {
        traceId: input.traceId,
        workflowId: input.context.workflowId,
        error: sanitizeErrorMessage(auditWriteError),
      });
    }
  }

  private async recordProviderFailedCall(input: {
    readonly context: AiWorkflowContextView;
    readonly asyncTaskRecordId: number;
    readonly traceId: string;
    readonly providerError: unknown;
    readonly providerStartedAt: Date;
  }): Promise<void> {
    const providerFinishedAt = new Date();
    const errorContext = resolveProviderErrorContext(input.providerError);
    try {
      await this.aiProviderCallRecordService.createRecord({
        data: {
          asyncTaskRecordId: input.asyncTaskRecordId,
          traceId: input.traceId,
          bizType: input.context.bizType,
          bizKey: input.context.bizKey,
          bizSubKey: input.context.bizSubKey,
          source: this.resolveSource(),
          provider: resolveText(errorContext.provider) ?? input.context.provider ?? 'unknown',
          model: input.context.model ?? 'unknown',
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
      this.logger.error('workflow provider failed call record write failed', {
        traceId: input.traceId,
        workflowId: input.context.workflowId,
        providerError: sanitizeErrorMessage(input.providerError),
        auditWriteError: sanitizeErrorMessage(auditWriteError),
      });
    }
  }

  private buildAcceptedResult(
    input: ConsumeAiWorkflowJobProcessInput,
  ): ConsumeAiWorkflowJobProcessResult {
    return {
      accepted: true,
      workflowId: input.workflowId,
      traceId: input.traceId,
    };
  }

  private resolveWorkflowAsyncBizKey(input: {
    readonly traceId: string;
    readonly jobId: string;
  }): string {
    return resolveAsyncTaskBizKey({
      domain: AI_WORKFLOW_ASYNC_TASK_BIZ_TYPE,
      traceId: input.traceId,
      jobId: input.jobId,
    });
  }

  private resolveProcessingAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade + 1, 1);
  }

  private resolveFinalAttemptCount(input: { readonly attemptsMade: number }): number {
    return Math.max(input.attemptsMade, 1);
  }

  private isFinalAttempt(input: {
    readonly attemptsMade: number;
    readonly maxAttempts?: number;
  }): boolean {
    if (typeof input.maxAttempts !== 'number' || Number.isNaN(input.maxAttempts)) {
      return true;
    }
    return this.resolveProcessingAttemptCount(input) >= input.maxAttempts;
  }

  private resolveFailureRecordStatus(input: {
    readonly context: AiWorkflowContextView | null;
    readonly jobId: string;
  }): AsyncTaskRecordTerminalStatus {
    if (input.context?.jobId === input.jobId && input.context.status === 'CANCELLED') {
      return 'cancelled';
    }
    return 'failed';
  }

  private resolveWorkerTerminalReason(input: {
    readonly status: AsyncTaskRecordTerminalStatus;
    readonly reason?: string;
  }): string {
    if (input.status === 'cancelled') {
      return this.resolveWorkerCancelledReason(input.reason);
    }
    return this.resolveWorkerFailedReason(input.reason);
  }

  private resolveWorkerFailedReason(reason?: string): string {
    const normalizedReason = normalizeWorkerReason(reason);
    if (
      normalizedReason.startsWith('worker_failed:') ||
      normalizedReason.startsWith('missing_payload_trace_id') ||
      normalizedReason.startsWith('missing_payload_workflow_id')
    ) {
      return normalizedReason.slice(0, 128);
    }
    const prefix = 'worker_failed:';
    const availableSummaryLength = Math.max(128 - prefix.length, 1);
    return `${prefix}${normalizedReason.slice(0, availableSummaryLength)}`;
  }

  private resolveWorkerCancelledReason(reason?: string): string {
    const normalizedReason = normalizeWorkerReason(reason);
    if (normalizedReason.startsWith('worker_cancelled:')) {
      return normalizedReason.slice(0, 128);
    }
    const summary = normalizedReason.startsWith('worker_failed:')
      ? normalizedReason.slice('worker_failed:'.length)
      : normalizedReason;
    const prefix = 'worker_cancelled:';
    const availableSummaryLength = Math.max(128 - prefix.length, 1);
    return `${prefix}${summary.slice(0, availableSummaryLength)}`;
  }

  private resolveSource(): AsyncTaskRecordSource {
    return 'system';
  }
}

function shouldRecordProviderCallFailure(error: unknown): boolean {
  if (!isDomainError(error)) {
    return false;
  }
  return error.code === THIRDPARTY_ERROR.PROVIDER_API_ERROR;
}

function isProcessingStateConflictFailure(value: unknown): boolean {
  if (value instanceof AiWorkflowNonRetryableError) {
    return value.reason === 'WORKFLOW_PROCESSING_STATE_CONFLICT';
  }
  if (value instanceof Error) {
    return value.message === 'workflow_processing_state_conflict';
  }
  if (typeof value === 'string') {
    return value.includes('workflow_processing_state_conflict');
  }
  return false;
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
    const message = resolveText(error.message) ?? 'ai_provider_unknown_error';
    return {
      provider,
      normalizedErrorCode: message,
      providerErrorCode,
      errorMessage: message,
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

function sanitizeErrorMessage(error: unknown): string {
  if (isAiWorkflowNonRetryableError(error)) {
    return normalizeErrorText(error.reason);
  }
  if (isDomainError(error)) {
    return normalizeErrorText(error.message);
  }
  if (error instanceof Error) {
    return normalizeErrorText(error.message || error.name || 'workflow_error');
  }
  if (typeof error === 'string') {
    return normalizeErrorText(error);
  }
  return 'workflow_unknown_error';
}

function normalizeWorkerReason(reason?: string): string {
  return (
    normalizeOptionalText(reason, 'to_undefined', { fieldName: 'worker_reason' }) ??
    'workflow_worker_unknown_error'
  );
}

function normalizeErrorText(value: string): string {
  return (
    normalizeOptionalText(value, 'to_undefined', { fieldName: 'workflow_error' }) ??
    'workflow_unknown_error'
  ).slice(0, 256);
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

function resolveText(value: string | undefined | null): string | undefined {
  const normalized = normalizeOptionalText(value, 'to_undefined');
  return normalized ?? undefined;
}
