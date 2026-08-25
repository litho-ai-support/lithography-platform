// src/usecases/ai-queue/queue-ai.usecase.ts
import { AI_PROVIDERS } from '@app-types/common/ai-provider.types';
import { Injectable } from '@nestjs/common';
import {
  DomainError,
  INPUT_NORMALIZE_ERROR,
  isDomainError,
} from '@src/core/common/errors/domain-error';
import {
  resolveAsyncTaskBizKey,
  resolveEnqueueFailureIdentifiers,
} from '@src/core/common/async-task/async-task-identifier.policy';
import {
  normalizeEnumValue,
  normalizeOptionalText,
  normalizeRequiredText,
} from '@src/core/common/input-normalize/input-normalize.policy';
import { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AsyncTaskRecordSource } from '@src/modules/async-task-record/async-task-record.types';
import { AiQueueService } from '@src/modules/common/ai-queue/ai-queue.service';
import {
  AI_EMBED_JOB_NAME,
  AI_GENERATE_JOB_NAME,
  AI_QUEUE_NAME,
} from '@src/modules/common/ai-queue/ai-queue.constants';
import type {
  QueueAiEmbedInput,
  QueueAiGenerateInput,
  QueueAiResult,
} from '@src/modules/common/ai-queue/ai-queue.types';
import type {
  QueueAiEmbedUsecaseInput,
  QueueAiGenerateUsecaseInput,
  QueueAiUsecaseResult,
} from './queue-ai.types';

type NormalizedQueueAiGenerateInput = QueueAiGenerateInput &
  Pick<QueueAiGenerateUsecaseInput, 'actorAccountId' | 'actorActiveRole'>;
type NormalizedQueueAiEmbedInput = QueueAiEmbedInput &
  Pick<QueueAiEmbedUsecaseInput, 'actorAccountId' | 'actorActiveRole'>;

@Injectable()
export class QueueAiUsecase {
  constructor(
    private readonly aiQueueService: AiQueueService,
    private readonly asyncTaskRecordService: AsyncTaskRecordService,
  ) {}

  async executeGenerate(input: QueueAiGenerateUsecaseInput): Promise<QueueAiUsecaseResult> {
    const normalizedInput = this.normalizeGenerateInput(input);
    const occurredAt = new Date();
    const result = await this.enqueueGenerateOrThrow({
      input: normalizedInput,
      occurredAt,
    });
    await this.asyncTaskRecordService.recordEnqueued({
      data: {
        queueName: AI_QUEUE_NAME,
        jobName: AI_GENERATE_JOB_NAME,
        jobId: result.jobId,
        traceId: result.traceId,
        actorAccountId: normalizedInput.actorAccountId,
        actorActiveRole: normalizedInput.actorActiveRole,
        bizType: 'ai_generation',
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_generation',
          traceId: result.traceId,
          jobId: result.jobId,
          dedupKey: normalizedInput.dedupKey,
        }),
        source: this.resolveSource(),
        reason: 'enqueue_accepted',
        occurredAt,
        dedupKey: normalizedInput.dedupKey,
      },
    });
    return result;
  }

  async executeEmbed(input: QueueAiEmbedUsecaseInput): Promise<QueueAiUsecaseResult> {
    const normalizedInput = this.normalizeEmbedInput(input);
    const occurredAt = new Date();
    const result = await this.enqueueEmbedOrThrow({
      input: normalizedInput,
      occurredAt,
    });
    await this.asyncTaskRecordService.recordEnqueued({
      data: {
        queueName: AI_QUEUE_NAME,
        jobName: AI_EMBED_JOB_NAME,
        jobId: result.jobId,
        traceId: result.traceId,
        actorAccountId: normalizedInput.actorAccountId,
        actorActiveRole: normalizedInput.actorActiveRole,
        bizType: 'ai_embedding',
        bizKey: resolveAsyncTaskBizKey({
          domain: 'ai_embedding',
          traceId: result.traceId,
          jobId: result.jobId,
          dedupKey: normalizedInput.dedupKey,
        }),
        source: this.resolveSource(),
        reason: 'enqueue_accepted',
        occurredAt,
        dedupKey: normalizedInput.dedupKey,
      },
    });
    return result;
  }

  private async enqueueGenerateOrThrow(input: {
    readonly input: NormalizedQueueAiGenerateInput;
    readonly occurredAt: Date;
  }): Promise<QueueAiResult> {
    try {
      return await this.aiQueueService.enqueueGenerate(input.input);
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error('ai_enqueue_failed');
      const identifiers = resolveEnqueueFailureIdentifiers({
        domain: 'ai_generation',
        traceId: input.input.traceId,
        occurredAt: input.occurredAt,
        dedupKey: input.input.dedupKey,
        traceIdPrefix: 'ai-generate-enqueue:',
      });
      await this.asyncTaskRecordService.recordEnqueueFailed({
        data: {
          queueName: AI_QUEUE_NAME,
          jobName: AI_GENERATE_JOB_NAME,
          jobId: identifiers.failedJobId,
          traceId: identifiers.traceId,
          actorAccountId: input.input.actorAccountId,
          actorActiveRole: input.input.actorActiveRole,
          bizType: 'ai_generation',
          bizKey: identifiers.bizKey,
          source: this.resolveSource(),
          reason: this.resolveEnqueueFailedReason({ message: normalizedError.message }),
          occurredAt: input.occurredAt,
          dedupKey: input.input.dedupKey,
        },
      });
      throw normalizedError;
    }
  }

  private async enqueueEmbedOrThrow(input: {
    readonly input: NormalizedQueueAiEmbedInput;
    readonly occurredAt: Date;
  }): Promise<QueueAiResult> {
    try {
      return await this.aiQueueService.enqueueEmbed(input.input);
    } catch (error: unknown) {
      const normalizedError = error instanceof Error ? error : new Error('ai_enqueue_failed');
      const identifiers = resolveEnqueueFailureIdentifiers({
        domain: 'ai_embedding',
        traceId: input.input.traceId,
        occurredAt: input.occurredAt,
        dedupKey: input.input.dedupKey,
        traceIdPrefix: 'ai-embed-enqueue:',
      });
      await this.asyncTaskRecordService.recordEnqueueFailed({
        data: {
          queueName: AI_QUEUE_NAME,
          jobName: AI_EMBED_JOB_NAME,
          jobId: identifiers.failedJobId,
          traceId: identifiers.traceId,
          actorAccountId: input.input.actorAccountId,
          actorActiveRole: input.input.actorActiveRole,
          bizType: 'ai_embedding',
          bizKey: identifiers.bizKey,
          source: this.resolveSource(),
          reason: this.resolveEnqueueFailedReason({ message: normalizedError.message }),
          occurredAt: input.occurredAt,
          dedupKey: input.input.dedupKey,
        },
      });
      throw normalizedError;
    }
  }

  private normalizeGenerateInput(
    input: QueueAiGenerateUsecaseInput,
  ): NormalizedQueueAiGenerateInput {
    const provider = this.normalizeOptionalInput(input.provider, 'AI 提供方');
    return {
      provider: provider === undefined ? undefined : this.normalizeProvider(provider),
      model: this.normalizeRequiredInput(input.model, '模型名称'),
      prompt: this.normalizeRequiredInput(input.prompt, '生成提示词'),
      metadata: input.metadata ?? undefined,
      dedupKey: this.normalizeOptionalInput(input.dedupKey, '幂等键'),
      traceId: this.normalizeOptionalInput(input.traceId, '链路追踪 ID'),
      actorAccountId: input.actorAccountId,
      actorActiveRole: input.actorActiveRole,
    };
  }

  private normalizeEmbedInput(input: QueueAiEmbedUsecaseInput): NormalizedQueueAiEmbedInput {
    return {
      model: this.normalizeRequiredInput(input.model, '模型名称'),
      text: this.normalizeRequiredInput(input.text, '向量化文本'),
      metadata: input.metadata ?? undefined,
      dedupKey: this.normalizeOptionalInput(input.dedupKey, '幂等键'),
      traceId: this.normalizeOptionalInput(input.traceId, '链路追踪 ID'),
      actorAccountId: input.actorAccountId,
      actorActiveRole: input.actorActiveRole,
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

  private normalizeProvider(input: string) {
    try {
      return normalizeEnumValue(input, AI_PROVIDERS, { fieldName: 'AI 提供方' });
    } catch (error: unknown) {
      if (isDomainError(error) && error.code === INPUT_NORMALIZE_ERROR.INVALID_ENUM_VALUE) {
        throw new DomainError(error.code, 'AI 提供方不在允许范围内', error.details, error);
      }
      throw error;
    }
  }

  private resolveSource(): AsyncTaskRecordSource {
    return 'user_action';
  }

  private resolveEnqueueFailedReason(input: { readonly message: string }): string {
    const normalizedMessage =
      normalizeOptionalText(input.message, 'to_undefined', { fieldName: 'enqueue_message' }) ??
      'enqueue_unknown_error';
    if (normalizedMessage.startsWith('enqueue_failed:')) {
      return normalizedMessage.slice(0, 128);
    }
    const prefix = 'enqueue_failed:';
    const availableSummaryLength = Math.max(128 - prefix.length, 1);
    const summary = normalizedMessage.slice(0, availableSummaryLength);
    return `${prefix}${summary}`;
  }
}
