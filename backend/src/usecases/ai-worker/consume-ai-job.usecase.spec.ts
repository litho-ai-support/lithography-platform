import type { GenerateAiContentResult, EmbedAiContentResult } from '@core/ai/ai-provider.interface';
import { DomainError, THIRDPARTY_ERROR } from '@src/core/common/errors/domain-error';
import type { AsyncTaskRecordView } from '@src/modules/async-task-record/async-task-record.types';
import type { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AiWorkerService } from '@src/modules/common/ai-worker/ai-worker.service';
import type {
  AiProviderCallRecordService,
  AiProviderCallRecordView,
} from '@src/modules/ai-provider-call-record/ai-provider-call-record.service';
import { ConsumeAiEmbedJobUsecase, ConsumeAiGenerateJobUsecase } from './consume-ai-job.usecase';

type AsyncTaskRecordServiceMock = {
  readonly recordStarted: jest.Mock<Promise<AsyncTaskRecordView>>;
};

type AiWorkerServiceMock = {
  readonly generate: jest.Mock<Promise<GenerateAiContentResult>>;
  readonly embed: jest.Mock<Promise<EmbedAiContentResult>>;
};

type AiProviderCallRecordServiceMock = {
  readonly createRecord: jest.Mock<Promise<AiProviderCallRecordView>>;
};

function createAsyncTaskRecordView(overrides?: {
  readonly id?: number;
  readonly traceId?: string;
  readonly bizType?: string;
  readonly bizKey?: string;
}): AsyncTaskRecordView {
  const now = new Date();
  return {
    id: overrides?.id ?? 1,
    queueName: 'ai',
    jobName: 'generate',
    jobId: 'job-1',
    traceId: overrides?.traceId ?? 'trace-1',
    actorAccountId: null,
    actorActiveRole: null,
    bizType: overrides?.bizType ?? 'ai_generation',
    bizKey: overrides?.bizKey ?? 'trace-1',
    bizSubKey: null,
    source: 'system',
    reason: 'worker_processing',
    occurredAt: now,
    dedupKey: null,
    status: 'processing',
    attemptCount: 1,
    maxAttempts: 1,
    enqueuedAt: now,
    startedAt: now,
    finishedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe('ConsumeAiJobUsecase audit side-effect', () => {
  let asyncTaskRecordService: AsyncTaskRecordServiceMock;
  let aiWorkerService: AiWorkerServiceMock;
  let aiProviderCallRecordService: AiProviderCallRecordServiceMock;

  beforeEach(() => {
    asyncTaskRecordService = {
      recordStarted: jest.fn(),
    };
    aiWorkerService = {
      generate: jest.fn(),
      embed: jest.fn(),
    };
    aiProviderCallRecordService = {
      createRecord: jest.fn(),
    };
  });

  it('generate 成功后审计落库失败时不应回流为 provider 失败', async () => {
    const usecase = new ConsumeAiGenerateJobUsecase(
      aiWorkerService as unknown as AiWorkerService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
      aiProviderCallRecordService as unknown as AiProviderCallRecordService,
    );
    asyncTaskRecordService.recordStarted.mockResolvedValue(
      createAsyncTaskRecordView({ bizType: 'ai_generation', bizKey: 'trace-1' }),
    );
    aiWorkerService.generate.mockResolvedValue({
      accepted: true,
      outputText: 'ok',
      provider: 'mock',
      model: 'gpt-4o-mini',
      providerJobId: 'provider-job-1',
    });
    aiProviderCallRecordService.createRecord.mockRejectedValue(new Error('db_write_failed'));

    const result = await usecase.process({
      queueName: 'ai',
      jobName: 'generate',
      jobId: 'job-1',
      traceId: 'trace-1',
      payload: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        prompt: 'hello',
      },
      attemptsMade: 0,
    });

    expect(result.outputText).toBe('ok');
    expect(aiWorkerService.generate).toHaveBeenCalledTimes(1);
    expect(aiProviderCallRecordService.createRecord).toHaveBeenCalledTimes(1);
    expect(aiProviderCallRecordService.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerStatus: 'succeeded',
        }),
      }),
    );
  });

  it('generate 失败且失败审计落库失败时应保留原始 provider 错误', async () => {
    const usecase = new ConsumeAiGenerateJobUsecase(
      aiWorkerService as unknown as AiWorkerService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
      aiProviderCallRecordService as unknown as AiProviderCallRecordService,
    );
    asyncTaskRecordService.recordStarted.mockResolvedValue(
      createAsyncTaskRecordView({ bizType: 'ai_generation', bizKey: 'trace-2' }),
    );
    const providerError = new DomainError(
      THIRDPARTY_ERROR.PROVIDER_API_ERROR,
      'ai_provider_timeout',
      { provider: 'openai' },
    );
    aiWorkerService.generate.mockRejectedValue(providerError);
    aiProviderCallRecordService.createRecord.mockRejectedValue(new Error('db_write_failed'));

    await expect(
      usecase.process({
        queueName: 'ai',
        jobName: 'generate',
        jobId: 'job-2',
        traceId: 'trace-2',
        payload: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          prompt: 'hello',
        },
        attemptsMade: 0,
      }),
    ).rejects.toBe(providerError);

    expect(aiProviderCallRecordService.createRecord).toHaveBeenCalledTimes(1);
    expect(aiProviderCallRecordService.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerStatus: 'failed',
          normalizedErrorCode: 'ai_provider_timeout',
        }),
      }),
    );
  });

  it('embed 成功后审计落库失败时不应回流为 provider 失败', async () => {
    const usecase = new ConsumeAiEmbedJobUsecase(
      aiWorkerService as unknown as AiWorkerService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
      aiProviderCallRecordService as unknown as AiProviderCallRecordService,
    );
    asyncTaskRecordService.recordStarted.mockResolvedValue(
      createAsyncTaskRecordView({ bizType: 'ai_embedding', bizKey: 'trace-3' }),
    );
    aiWorkerService.embed.mockResolvedValue({
      accepted: true,
      vector: [0.1, 0.2, 0.3],
      provider: 'mock',
      model: 'text-embedding-3-small',
      providerJobId: 'provider-job-3',
    });
    aiProviderCallRecordService.createRecord.mockRejectedValue(new Error('db_write_failed'));

    const result = await usecase.process({
      queueName: 'ai',
      jobName: 'embed',
      jobId: 'job-3',
      traceId: 'trace-3',
      payload: {
        model: 'text-embedding-3-small',
        text: 'hello',
      },
      attemptsMade: 0,
    });

    expect(result.vector).toEqual([0.1, 0.2, 0.3]);
    expect(aiWorkerService.embed).toHaveBeenCalledTimes(1);
    expect(aiProviderCallRecordService.createRecord).toHaveBeenCalledTimes(1);
    expect(aiProviderCallRecordService.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerStatus: 'succeeded',
        }),
      }),
    );
  });

  it('embed 失败且失败审计落库失败时应保留原始 provider 错误', async () => {
    const usecase = new ConsumeAiEmbedJobUsecase(
      aiWorkerService as unknown as AiWorkerService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
      aiProviderCallRecordService as unknown as AiProviderCallRecordService,
    );
    asyncTaskRecordService.recordStarted.mockResolvedValue(
      createAsyncTaskRecordView({ bizType: 'ai_embedding', bizKey: 'trace-4' }),
    );
    const providerError = new DomainError(
      THIRDPARTY_ERROR.PROVIDER_API_ERROR,
      'ai_provider_auth_failed',
      { provider: 'mock' },
    );
    aiWorkerService.embed.mockRejectedValue(providerError);
    aiProviderCallRecordService.createRecord.mockRejectedValue(new Error('db_write_failed'));

    await expect(
      usecase.process({
        queueName: 'ai',
        jobName: 'embed',
        jobId: 'job-4',
        traceId: 'trace-4',
        payload: {
          model: 'text-embedding-3-small',
          text: 'hello',
        },
        attemptsMade: 0,
      }),
    ).rejects.toBe(providerError);

    expect(aiProviderCallRecordService.createRecord).toHaveBeenCalledTimes(1);
    expect(aiProviderCallRecordService.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerStatus: 'failed',
          normalizedErrorCode: 'ai_provider_auth_failed',
        }),
      }),
    );
  });

  it('generate 未真正发起 provider 请求时不应写 provider failed 记录', async () => {
    const usecase = new ConsumeAiGenerateJobUsecase(
      aiWorkerService as unknown as AiWorkerService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
      aiProviderCallRecordService as unknown as AiProviderCallRecordService,
    );
    asyncTaskRecordService.recordStarted.mockResolvedValue(
      createAsyncTaskRecordView({ bizType: 'ai_generation', bizKey: 'trace-5' }),
    );
    const providerError = new DomainError(
      THIRDPARTY_ERROR.PROVIDER_NOT_SUPPORTED,
      'unsupported_ai_provider:unknown',
    );
    aiWorkerService.generate.mockRejectedValue(providerError);

    await expect(
      usecase.process({
        queueName: 'ai',
        jobName: 'generate',
        jobId: 'job-5',
        traceId: 'trace-5',
        payload: {
          provider: 'unknown',
          model: 'gpt-4o-mini',
          prompt: 'hello',
        },
        attemptsMade: 0,
      }),
    ).rejects.toBe(providerError);

    expect(aiProviderCallRecordService.createRecord).not.toHaveBeenCalled();
  });

  it('embed 未真正发起 provider 请求时不应写 provider failed 记录', async () => {
    const usecase = new ConsumeAiEmbedJobUsecase(
      aiWorkerService as unknown as AiWorkerService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
      aiProviderCallRecordService as unknown as AiProviderCallRecordService,
    );
    asyncTaskRecordService.recordStarted.mockResolvedValue(
      createAsyncTaskRecordView({ bizType: 'ai_embedding', bizKey: 'trace-6' }),
    );
    const providerError = new DomainError(
      THIRDPARTY_ERROR.PROVIDER_CONFIG_MISSING,
      'ai_provider_config_missing',
    );
    aiWorkerService.embed.mockRejectedValue(providerError);

    await expect(
      usecase.process({
        queueName: 'ai',
        jobName: 'embed',
        jobId: 'job-6',
        traceId: 'trace-6',
        payload: {
          model: 'text-embedding-3-small',
          text: 'hello',
        },
        attemptsMade: 0,
      }),
    ).rejects.toBe(providerError);

    expect(aiProviderCallRecordService.createRecord).not.toHaveBeenCalled();
  });
});
