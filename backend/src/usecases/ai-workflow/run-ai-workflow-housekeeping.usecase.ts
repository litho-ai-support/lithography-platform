import { Inject, Injectable } from '@nestjs/common';
import { resolveAsyncTaskBizKey } from '@src/core/common/async-task/async-task-identifier.policy';
import { normalizeOptionalText } from '@src/core/common/input-normalize/input-normalize.policy';
import { AiWorkflowContextService } from '@src/modules/ai-workflow-context/ai-workflow-context.service';
import { requireAiWorkflowTerminalDrain } from '@src/modules/ai-workflow-context/ai-workflow-capability.gate';
import type {
  AiWorkflowContextHousekeepingCandidate,
  AiWorkflowContextStatus,
  AiWorkflowContextTerminalStatus,
} from '@src/modules/ai-workflow-context/ai-workflow-context.types';
import { AiWorkflowQueueService } from '@src/modules/ai-workflow-context/queue/ai-workflow-queue.service';
import {
  CAPABILITY_STATE_READER,
  type CapabilityStateReader,
} from '@src/modules/common/capability-state-reader.contract';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type {
  AsyncTaskRecordTerminalStatus,
  AsyncTaskRecordView,
} from '@src/modules/async-task-record/async-task-record.types';
import { AsyncTaskRecordQueryService } from '@src/modules/async-task-record/queries/async-task-record.query.service';
import { PinoLogger } from 'nestjs-pino';
import {
  AI_WORKFLOW_ASYNC_TASK_BIZ_TYPE,
  AI_WORKFLOW_HOUSEKEEPING_DEFAULT_BATCH_LIMIT,
  AI_WORKFLOW_HOUSEKEEPING_DEFAULT_STALE_QUEUED_GRACE_MS,
  AI_WORKFLOW_JOB_NAME,
  AI_WORKFLOW_QUEUE_NAME,
  type AiWorkflowHousekeepingPhaseResult,
  type RunAiWorkflowHousekeepingInput,
  type RunAiWorkflowHousekeepingResult,
} from './ai-workflow-usecases.types';
import { CreateAndAdmitAiWorkflowUsecase } from './create-and-admit-ai-workflow.usecase';

@Injectable()
export class RunAiWorkflowHousekeepingUsecase {
  constructor(
    private readonly aiWorkflowContextService: AiWorkflowContextService,
    private readonly aiWorkflowQueueService: AiWorkflowQueueService,
    private readonly asyncTaskRecordService: AsyncTaskRecordService,
    private readonly asyncTaskRecordQueryService: AsyncTaskRecordQueryService,
    private readonly createAndAdmitAiWorkflowUsecase: CreateAndAdmitAiWorkflowUsecase,
    private readonly logger: PinoLogger,
    @Inject(CAPABILITY_STATE_READER)
    private readonly capabilityStateReader: CapabilityStateReader,
  ) {
    this.logger.setContext(RunAiWorkflowHousekeepingUsecase.name);
  }

  async execute(
    input: RunAiWorkflowHousekeepingInput = {},
  ): Promise<RunAiWorkflowHousekeepingResult> {
    const workflowState = this.capabilityStateReader.getState('ai.workflow');
    const canRunEnabledPhases = workflowState.effectiveState === 'enabled';
    if (!canRunEnabledPhases) {
      requireAiWorkflowTerminalDrain(this.capabilityStateReader);
    }
    const now = input.now ?? new Date();
    const limit = resolveBatchLimit(input.limit);
    return {
      admission: canRunEnabledPhases
        ? await this.drainAdmissionWaiting({ now, limit })
        : createEmptyPhaseResult(),
      staleQueued: canRunEnabledPhases
        ? await this.repairStaleQueued({
            now,
            limit,
            staleQueuedGraceMs:
              input.staleQueuedGraceMs ?? AI_WORKFLOW_HOUSEKEEPING_DEFAULT_STALE_QUEUED_GRACE_MS,
          })
        : createEmptyPhaseResult(),
      asyncTaskReconcile: await this.reconcileTerminalAsyncTasks({ now, limit }),
    };
  }

  private async drainAdmissionWaiting(input: {
    readonly now: Date;
    readonly limit: number;
  }): Promise<AiWorkflowHousekeepingPhaseResult> {
    const candidates = await this.aiWorkflowContextService.listDueAdmissionWaitingContexts({
      now: input.now,
      limit: input.limit,
    });
    const result = createPhaseResult(candidates.length);
    for (const candidate of candidates) {
      try {
        if (isExpired({ expiresAt: candidate.admissionExpiresAt, now: input.now })) {
          const failed = await this.aiWorkflowContextService.markFailed({
            workflowId: candidate.workflowId,
            expectedStatuses: ['ADMISSION_WAITING'],
            errorCode: 'ADMISSION_TIMEOUT',
            errorMessage: 'ADMISSION_TIMEOUT',
          });
          if (failed.status === 'CONFLICT') {
            result.skipped += 1;
          } else {
            result.succeeded += 1;
          }
          continue;
        }

        const admitted = await this.createAndAdmitAiWorkflowUsecase.admitExisting({
          workflowId: candidate.workflowId,
          now: input.now,
        });
        if (admitted.status === 'QUEUED') {
          result.succeeded += 1;
        } else if (admitted.status === 'STALE_QUEUED') {
          result.failed += 1;
          this.logItemFailure({
            phase: 'admission',
            workflowId: candidate.workflowId,
            jobId: admitted.jobId,
            error: admitted.reason,
          });
        } else {
          result.skipped += 1;
        }
      } catch (error: unknown) {
        result.failed += 1;
        this.logItemFailure({
          phase: 'admission',
          workflowId: candidate.workflowId,
          jobId: candidate.jobId,
          error,
        });
      }
    }
    return freezePhaseResult(result);
  }

  private async repairStaleQueued(input: {
    readonly now: Date;
    readonly limit: number;
    readonly staleQueuedGraceMs: number;
  }): Promise<AiWorkflowHousekeepingPhaseResult> {
    const staleBefore = new Date(input.now.getTime() - input.staleQueuedGraceMs);
    const candidates = await this.aiWorkflowContextService.listStaleQueuedContexts({
      staleBefore,
      limit: input.limit,
    });
    const result = createPhaseResult(candidates.length);
    for (const candidate of candidates) {
      try {
        if (!candidate.jobId) {
          result.skipped += 1;
          continue;
        }

        const existingJob = await this.aiWorkflowQueueService.hasWorkflowJob({
          jobId: candidate.jobId,
        });
        if (existingJob.exists && candidate.asyncTaskRecordId !== null) {
          const linkedRecord = await this.asyncTaskRecordQueryService.findById({
            id: candidate.asyncTaskRecordId,
          });
          if (isLinkedAsyncTaskRecordValid({ candidate, record: linkedRecord })) {
            result.skipped += 1;
            continue;
          }
          this.logLinkedAsyncTaskRecordMismatch({
            candidate,
            record: linkedRecord,
          });
        }

        if (
          !existingJob.exists &&
          isExpired({ expiresAt: candidate.admissionExpiresAt, now: input.now })
        ) {
          const failed = await this.aiWorkflowContextService.markFailed({
            workflowId: candidate.workflowId,
            expectedStatuses: ['QUEUED'],
            errorCode: 'ENQUEUE_REPAIR_TIMEOUT',
            errorMessage: 'ENQUEUE_REPAIR_TIMEOUT',
          });
          if (failed.status === 'CONFLICT') {
            result.skipped += 1;
          } else {
            result.succeeded += 1;
          }
          continue;
        }

        if (!existingJob.exists) {
          await this.aiWorkflowQueueService.enqueueWorkflow({
            workflowId: candidate.workflowId,
            traceId: candidate.traceId,
            jobId: candidate.jobId,
          });
        }

        const asyncTaskRecord = await this.asyncTaskRecordService.recordEnqueued({
          data: {
            queueName: candidate.queueName ?? AI_WORKFLOW_QUEUE_NAME,
            jobName: candidate.jobName ?? AI_WORKFLOW_JOB_NAME,
            jobId: candidate.jobId,
            traceId: candidate.traceId,
            actorAccountId: candidate.actorAccountId,
            actorActiveRole: candidate.actorActiveRole,
            bizType: AI_WORKFLOW_ASYNC_TASK_BIZ_TYPE,
            bizKey: resolveWorkflowAsyncBizKey(candidate),
            source: candidate.source,
            reason: 'enqueue_accepted',
            occurredAt: input.now,
            enqueuedAt: input.now,
          },
        });
        const linked = await this.aiWorkflowContextService.linkAsyncTaskRecord({
          workflowId: candidate.workflowId,
          jobId: candidate.jobId,
          asyncTaskRecordId: asyncTaskRecord.id,
          expectedStatuses: ['QUEUED', 'PROCESSING'],
        });
        if (linked.status === 'CONFLICT') {
          result.skipped += 1;
        } else {
          result.succeeded += 1;
        }
      } catch (error: unknown) {
        result.failed += 1;
        this.logItemFailure({
          phase: 'staleQueued',
          workflowId: candidate.workflowId,
          jobId: candidate.jobId,
          error,
        });
      }
    }
    return freezePhaseResult(result);
  }

  private async reconcileTerminalAsyncTasks(input: {
    readonly now: Date;
    readonly limit: number;
  }): Promise<AiWorkflowHousekeepingPhaseResult> {
    const candidates = await this.aiWorkflowContextService.listTerminalContextsForDrain({
      limit: input.limit,
    });
    const result = createPhaseResult(candidates.length);
    for (const candidate of candidates) {
      try {
        const queueName = candidate.queueName;
        const jobName = candidate.jobName;
        const jobId = candidate.jobId;
        if (!queueName || !jobName || !jobId) {
          result.skipped += 1;
          continue;
        }

        const expectedStatus = resolveAsyncTaskTerminalStatus(candidate.status);
        if (!expectedStatus) {
          result.skipped += 1;
          continue;
        }

        const existingRecord = await this.asyncTaskRecordQueryService.findByQueueJob({
          where: { queueName, jobId },
        });
        if (existingRecord?.status === expectedStatus) {
          await this.linkTerminalRecordIfNeeded({
            candidate,
            jobId,
            asyncTaskRecordId: existingRecord.id,
            result,
          });
          continue;
        }
        if (existingRecord && isAsyncTaskRecordTerminalStatus(existingRecord.status)) {
          result.skipped += 1;
          this.logTerminalAsyncTaskRecordMismatch({
            candidate,
            expectedStatus,
            record: existingRecord,
          });
          continue;
        }

        const record = await this.asyncTaskRecordService.recordFinished({
          data: {
            queueName,
            jobName,
            jobId,
            traceId: candidate.traceId,
            bizType: AI_WORKFLOW_ASYNC_TASK_BIZ_TYPE,
            bizKey: resolveWorkflowAsyncBizKey(candidate),
            source: 'system',
            status: expectedStatus,
            reason: resolveReconcileReason(expectedStatus),
            attemptCount: existingRecord?.attemptCount,
            maxAttempts: existingRecord?.maxAttempts,
            enqueuedAt: existingRecord?.enqueuedAt,
            startedAt: existingRecord?.startedAt,
            finishedAt: input.now,
            occurredAt: input.now,
          },
        });
        await this.linkTerminalRecordIfNeeded({
          candidate,
          jobId,
          asyncTaskRecordId: record.id,
          result,
          countAlreadyReconciledAsSucceeded: true,
        });
      } catch (error: unknown) {
        result.failed += 1;
        this.logItemFailure({
          phase: 'asyncTaskReconcile',
          workflowId: candidate.workflowId,
          jobId: candidate.jobId,
          error,
        });
      }
    }
    return freezePhaseResult(result);
  }

  private async linkTerminalRecordIfNeeded(input: {
    readonly candidate: AiWorkflowContextHousekeepingCandidate;
    readonly jobId: string;
    readonly asyncTaskRecordId: number;
    readonly result: MutablePhaseResult;
    readonly countAlreadyReconciledAsSucceeded?: boolean;
  }): Promise<void> {
    if (input.candidate.asyncTaskRecordId === input.asyncTaskRecordId) {
      if (input.countAlreadyReconciledAsSucceeded === true) {
        input.result.succeeded += 1;
      } else {
        input.result.skipped += 1;
      }
      return;
    }

    const linked = await this.aiWorkflowContextService.linkTerminalAsyncTaskRecordForDrain({
      workflowId: input.candidate.workflowId,
      jobId: input.jobId,
      asyncTaskRecordId: input.asyncTaskRecordId,
      expectedStatuses: [requireTerminalWorkflowStatus(input.candidate.status)],
    });
    if (linked.status === 'CONFLICT') {
      input.result.skipped += 1;
    } else {
      input.result.succeeded += 1;
    }
  }

  private logItemFailure(input: {
    readonly phase: string;
    readonly workflowId: string;
    readonly jobId: string | null;
    readonly error: unknown;
  }): void {
    this.logger.warn(
      {
        phase: input.phase,
        workflowId: input.workflowId,
        jobId: input.jobId,
        error: sanitizeErrorMessage(input.error),
      },
      'AI workflow housekeeping item failed',
    );
  }

  private logLinkedAsyncTaskRecordMismatch(input: {
    readonly candidate: AiWorkflowContextHousekeepingCandidate;
    readonly record: AsyncTaskRecordView | null;
  }): void {
    this.logger.warn(
      {
        phase: 'staleQueued',
        workflowId: input.candidate.workflowId,
        jobId: input.candidate.jobId,
        asyncTaskRecordId: input.candidate.asyncTaskRecordId,
        linkedRecordFound: input.record !== null,
        linkedRecordQueueName: input.record?.queueName,
        linkedRecordJobName: input.record?.jobName,
        linkedRecordJobId: input.record?.jobId,
        linkedRecordTraceId: input.record?.traceId,
      },
      'AI workflow linked async task record mismatch, attempting repair',
    );
  }

  private logTerminalAsyncTaskRecordMismatch(input: {
    readonly candidate: AiWorkflowContextHousekeepingCandidate;
    readonly expectedStatus: AsyncTaskRecordTerminalStatus;
    readonly record: AsyncTaskRecordView;
  }): void {
    this.logger.warn(
      {
        phase: 'asyncTaskReconcile',
        workflowId: input.candidate.workflowId,
        jobId: input.candidate.jobId,
        asyncTaskRecordId: input.record.id,
        workflowStatus: input.candidate.status,
        asyncTaskRecordStatus: input.record.status,
        expectedStatus: input.expectedStatus,
      },
      'AI workflow terminal async task record status mismatch',
    );
  }
}

type MutablePhaseResult = {
  scanned: number;
  succeeded: number;
  skipped: number;
  failed: number;
};

function createPhaseResult(scanned: number): MutablePhaseResult {
  return {
    scanned,
    succeeded: 0,
    skipped: 0,
    failed: 0,
  };
}

function createEmptyPhaseResult(): AiWorkflowHousekeepingPhaseResult {
  return { scanned: 0, succeeded: 0, skipped: 0, failed: 0 };
}

function freezePhaseResult(input: MutablePhaseResult): AiWorkflowHousekeepingPhaseResult {
  return {
    scanned: input.scanned,
    succeeded: input.succeeded,
    skipped: input.skipped,
    failed: input.failed,
  };
}

function resolveBatchLimit(value: number | undefined): number {
  if (value === undefined) {
    return AI_WORKFLOW_HOUSEKEEPING_DEFAULT_BATCH_LIMIT;
  }
  if (!Number.isInteger(value) || value <= 0) {
    return 1;
  }
  return Math.min(value, 500);
}

function isExpired(input: { readonly expiresAt: Date | null; readonly now: Date }): boolean {
  return input.expiresAt !== null && input.expiresAt.getTime() <= input.now.getTime();
}

function resolveWorkflowAsyncBizKey(candidate: AiWorkflowContextHousekeepingCandidate): string {
  return resolveAsyncTaskBizKey({
    domain: AI_WORKFLOW_ASYNC_TASK_BIZ_TYPE,
    traceId: candidate.traceId,
    jobId: candidate.jobId ?? candidate.workflowId,
  });
}

function resolveAsyncTaskTerminalStatus(
  status: AiWorkflowContextHousekeepingCandidate['status'],
): AsyncTaskRecordTerminalStatus | null {
  if (status === 'SUCCEEDED') {
    return 'succeeded';
  }
  if (status === 'FAILED') {
    return 'failed';
  }
  if (status === 'CANCELLED') {
    return 'cancelled';
  }
  return null;
}

function requireTerminalWorkflowStatus(
  status: AiWorkflowContextStatus,
): AiWorkflowContextTerminalStatus {
  if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED') return status;
  throw new Error(`AI workflow terminal drain received non-terminal status: ${status}`);
}

function isAsyncTaskRecordTerminalStatus(
  status: AsyncTaskRecordView['status'],
): status is AsyncTaskRecordTerminalStatus {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled';
}

function isLinkedAsyncTaskRecordValid(input: {
  readonly candidate: AiWorkflowContextHousekeepingCandidate;
  readonly record: AsyncTaskRecordView | null;
}): boolean {
  if (!input.record || !input.candidate.jobId) {
    return false;
  }
  return (
    input.record.queueName === (input.candidate.queueName ?? AI_WORKFLOW_QUEUE_NAME) &&
    input.record.jobName === (input.candidate.jobName ?? AI_WORKFLOW_JOB_NAME) &&
    input.record.jobId === input.candidate.jobId &&
    input.record.traceId === input.candidate.traceId
  );
}

function resolveReconcileReason(status: AsyncTaskRecordTerminalStatus): string {
  if (status === 'succeeded') {
    return 'worker_completed';
  }
  if (status === 'failed') {
    return 'worker_failed:workflow_reconciled';
  }
  return 'worker_cancelled:workflow_reconciled';
}

function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return (error.message || error.name || 'workflow_housekeeping_error').slice(0, 256);
  }
  if (typeof error === 'string') {
    return (
      normalizeOptionalText(error, 'to_undefined', { fieldName: 'workflow_housekeeping_error' }) ??
      'workflow_housekeeping_error'
    ).slice(0, 256);
  }
  return 'workflow_housekeeping_error';
}
