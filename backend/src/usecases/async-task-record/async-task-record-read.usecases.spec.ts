import { DomainError, INPUT_NORMALIZE_ERROR } from '@src/core/common/errors/domain-error';
import type { AsyncTaskRecordView } from '@src/modules/async-task-record/async-task-record.types';
import { AsyncTaskRecordQueryService } from '@src/modules/async-task-record/queries/async-task-record.query.service';
import { Test, TestingModule } from '@nestjs/testing';
import { GetAsyncTaskRecordByQueueJobUsecase } from './get-async-task-record-by-queue-job.usecase';
import type { GetAsyncTaskRecordByQueueJobInput } from './get-async-task-record-by-queue-job.types';
import { ListAsyncTaskRecordsByBizTargetUsecase } from './list-async-task-records-by-biz-target.usecase';
import { ListAsyncTaskRecordsByTraceIdUsecase } from './list-async-task-records-by-trace-id.usecase';

type AsyncTaskRecordQueryServiceMock = {
  readonly findByQueueJob: jest.Mock<Promise<AsyncTaskRecordView | null>>;
  readonly listByTraceId: jest.Mock<Promise<AsyncTaskRecordView[]>>;
  readonly listByBizTarget: jest.Mock<Promise<AsyncTaskRecordView[]>>;
};

const createAsyncTaskRecord = (
  input: Partial<AsyncTaskRecordView> & Pick<AsyncTaskRecordView, 'id' | 'jobId' | 'traceId'>,
): AsyncTaskRecordView => {
  const baseDate = new Date('2026-01-01T00:00:00.000Z');
  const defaults: AsyncTaskRecordView = {
    id: input.id,
    queueName: 'ai',
    jobName: 'generate',
    jobId: input.jobId,
    traceId: input.traceId,
    actorAccountId: null,
    actorActiveRole: null,
    bizType: 'ai_generation',
    bizKey: input.traceId,
    bizSubKey: null,
    source: 'system',
    reason: null,
    occurredAt: null,
    dedupKey: null,
    status: 'queued',
    attemptCount: 0,
    maxAttempts: null,
    enqueuedAt: baseDate,
    startedAt: null,
    finishedAt: null,
    createdAt: baseDate,
    updatedAt: baseDate,
  };
  return { ...defaults, ...input };
};

describe('AsyncTaskRecord read usecases', () => {
  let getByQueueJobUsecase: GetAsyncTaskRecordByQueueJobUsecase;
  let listByTraceIdUsecase: ListAsyncTaskRecordsByTraceIdUsecase;
  let listByBizTargetUsecase: ListAsyncTaskRecordsByBizTargetUsecase;
  let queryService: AsyncTaskRecordQueryServiceMock;

  beforeEach(async () => {
    queryService = {
      findByQueueJob: jest.fn(),
      listByTraceId: jest.fn(),
      listByBizTarget: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GetAsyncTaskRecordByQueueJobUsecase,
        ListAsyncTaskRecordsByTraceIdUsecase,
        ListAsyncTaskRecordsByBizTargetUsecase,
        {
          provide: AsyncTaskRecordQueryService,
          useValue: queryService,
        },
      ],
    }).compile();

    getByQueueJobUsecase = module.get(GetAsyncTaskRecordByQueueJobUsecase);
    listByTraceIdUsecase = module.get(ListAsyncTaskRecordsByTraceIdUsecase);
    listByBizTargetUsecase = module.get(ListAsyncTaskRecordsByBizTargetUsecase);
  });

  describe('GetAsyncTaskRecordByQueueJobUsecase', () => {
    it('应去空白后调用 query service', async () => {
      const record = createAsyncTaskRecord({
        id: 1,
        jobId: 'job-1',
        traceId: 'trace-1',
      });
      queryService.findByQueueJob.mockResolvedValue(record);
      const input: GetAsyncTaskRecordByQueueJobInput = {
        queueName: '  ai  ',
        jobId: '  job-1  ',
      };

      const result = await getByQueueJobUsecase.execute(input);

      expect(queryService.findByQueueJob).toHaveBeenCalledWith({
        where: {
          queueName: 'ai',
          jobId: 'job-1',
        },
      });
      expect(result).toEqual(record);
    });

    it('queueName 为空白时抛出 DomainError', async () => {
      await expect(
        getByQueueJobUsecase.execute({
          queueName: '   ',
          jobId: 'job-1',
        }),
      ).rejects.toMatchObject<Partial<DomainError>>({
        code: INPUT_NORMALIZE_ERROR.REQUIRED_TEXT_EMPTY,
        message: 'queueName 不能为空',
      });
    });

    it('jobId 为空白时抛出 DomainError', async () => {
      await expect(
        getByQueueJobUsecase.execute({
          queueName: 'ai',
          jobId: '   ',
        }),
      ).rejects.toMatchObject<Partial<DomainError>>({
        code: INPUT_NORMALIZE_ERROR.REQUIRED_TEXT_EMPTY,
        message: 'jobId 不能为空',
      });
    });
  });

  describe('ListAsyncTaskRecordsByTraceIdUsecase', () => {
    it('未传 limit 时应使用默认值 50', async () => {
      const record = createAsyncTaskRecord({
        id: 2,
        jobId: 'job-2',
        traceId: 'trace-2',
      });
      queryService.listByTraceId.mockResolvedValue([record]);

      const result = await listByTraceIdUsecase.execute({
        traceId: '  trace-2  ',
      });

      expect(queryService.listByTraceId).toHaveBeenCalledWith({
        where: {
          traceId: 'trace-2',
          queueName: undefined,
          bizTypes: undefined,
          limit: 50,
        },
      });
      expect(result.items).toEqual([record]);
    });

    it('显式传 limit 时应原样透传', async () => {
      queryService.listByTraceId.mockResolvedValue([]);

      await listByTraceIdUsecase.execute({
        traceId: 'trace-2',
        limit: 12,
      });

      expect(queryService.listByTraceId).toHaveBeenCalledWith({
        where: {
          traceId: 'trace-2',
          queueName: undefined,
          bizTypes: undefined,
          limit: 12,
        },
      });
    });

    it('应透传标准化后的可选筛选条件', async () => {
      queryService.listByTraceId.mockResolvedValue([]);

      await listByTraceIdUsecase.execute({
        traceId: 'trace-2',
        queueName: '  ai ',
        bizTypes: [' ai_generation ', '  ', 'ai_worker'],
      });

      expect(queryService.listByTraceId).toHaveBeenCalledWith({
        where: {
          traceId: 'trace-2',
          queueName: 'ai',
          bizTypes: ['ai_generation', 'ai_worker'],
          limit: 50,
        },
      });
    });

    it('traceId 为空白时抛出 DomainError', async () => {
      await expect(
        listByTraceIdUsecase.execute({
          traceId: ' ',
        }),
      ).rejects.toMatchObject<Partial<DomainError>>({
        code: INPUT_NORMALIZE_ERROR.REQUIRED_TEXT_EMPTY,
        message: 'traceId 不能为空',
      });
    });
  });

  describe('ListAsyncTaskRecordsByBizTargetUsecase', () => {
    it('应标准化 bizSubKey 后透传 statuses 并使用默认 limit 50', async () => {
      const record = createAsyncTaskRecord({
        id: 3,
        jobId: 'job-3',
        traceId: 'trace-3',
        bizType: 'ai_worker',
        bizKey: 'trace-3',
      });
      queryService.listByBizTarget.mockResolvedValue([record]);

      const result = await listByBizTargetUsecase.execute({
        bizType: '  ai_worker ',
        bizKey: '  trace-3 ',
        bizSubKey: '  task-sub-key  ',
        statuses: ['failed'],
      });

      expect(queryService.listByBizTarget).toHaveBeenCalledWith({
        where: {
          queueName: undefined,
          bizType: 'ai_worker',
          bizKey: 'trace-3',
          bizSubKey: 'task-sub-key',
          statuses: ['failed'],
          limit: 50,
        },
      });
      expect(result.items).toEqual([record]);
    });

    it('显式传 limit 时应原样透传', async () => {
      queryService.listByBizTarget.mockResolvedValue([]);

      await listByBizTargetUsecase.execute({
        bizType: 'ai_worker',
        bizKey: 'trace-3',
        limit: 7,
      });

      expect(queryService.listByBizTarget).toHaveBeenCalledWith({
        where: {
          queueName: undefined,
          bizType: 'ai_worker',
          bizKey: 'trace-3',
          bizSubKey: undefined,
          statuses: undefined,
          limit: 7,
        },
      });
    });

    it('bizSubKey 为空白字符串时应标准化为 null', async () => {
      queryService.listByBizTarget.mockResolvedValue([]);

      await listByBizTargetUsecase.execute({
        bizType: 'ai_worker',
        bizKey: 'trace-3',
        bizSubKey: '   ',
      });

      expect(queryService.listByBizTarget).toHaveBeenCalledWith({
        where: {
          queueName: undefined,
          bizType: 'ai_worker',
          bizKey: 'trace-3',
          bizSubKey: null,
          statuses: undefined,
          limit: 50,
        },
      });
    });

    it('bizKey 为空白时抛出 DomainError', async () => {
      await expect(
        listByBizTargetUsecase.execute({
          bizType: 'ai_worker',
          bizKey: '   ',
        }),
      ).rejects.toMatchObject<Partial<DomainError>>({
        code: INPUT_NORMALIZE_ERROR.REQUIRED_TEXT_EMPTY,
        message: 'bizKey 不能为空',
      });
    });

    it('bizType 为空白时抛出 DomainError', async () => {
      await expect(
        listByBizTargetUsecase.execute({
          bizType: '   ',
          bizKey: 'trace-3',
        }),
      ).rejects.toMatchObject<Partial<DomainError>>({
        code: INPUT_NORMALIZE_ERROR.REQUIRED_TEXT_EMPTY,
        message: 'bizType 不能为空',
      });
    });

    it('应透传标准化后的 queueName 过滤条件', async () => {
      queryService.listByBizTarget.mockResolvedValue([]);

      await listByBizTargetUsecase.execute({
        queueName: ' ai ',
        bizType: 'ai_worker',
        bizKey: 'trace-3',
      });

      expect(queryService.listByBizTarget).toHaveBeenCalledWith({
        where: {
          queueName: 'ai',
          bizType: 'ai_worker',
          bizKey: 'trace-3',
          bizSubKey: undefined,
          statuses: undefined,
          limit: 50,
        },
      });
    });
  });
});
