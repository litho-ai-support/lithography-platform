import { INPUT_NORMALIZE_ERROR } from '@src/core/common/errors/domain-error';
import type { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { AiQueueService } from '@src/modules/common/ai-queue/ai-queue.service';
import { QueueAiUsecase } from './queue-ai.usecase';

describe(QueueAiUsecase.name, () => {
  it('normalizes generate text and preserves the legacy optional blank policy in the usecase', async () => {
    const aiQueueService = {
      enqueueGenerate: jest.fn().mockResolvedValue({ jobId: 'job-1', traceId: 'trace-1' }),
    };
    const asyncTaskRecordService = {
      recordEnqueued: jest.fn().mockResolvedValue(undefined),
    };
    const usecase = new QueueAiUsecase(
      aiQueueService as unknown as AiQueueService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
    );

    await usecase.executeGenerate({
      provider: '   ',
      model: ' model-1 ',
      prompt: ' hello ',
      dedupKey: '   ',
      traceId: ' trace-1 ',
    });

    expect(aiQueueService.enqueueGenerate).toHaveBeenCalledWith({
      provider: undefined,
      model: 'model-1',
      prompt: 'hello',
      metadata: undefined,
      dedupKey: undefined,
      traceId: 'trace-1',
      actorAccountId: undefined,
      actorActiveRole: undefined,
    });
  });

  it('rejects required blank text before calling the queue module', async () => {
    const aiQueueService = { enqueueEmbed: jest.fn() };
    const asyncTaskRecordService = { recordEnqueued: jest.fn() };
    const usecase = new QueueAiUsecase(
      aiQueueService as unknown as AiQueueService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
    );

    await expect(usecase.executeEmbed({ model: 'model-1', text: '   ' })).rejects.toMatchObject({
      code: INPUT_NORMALIZE_ERROR.REQUIRED_TEXT_EMPTY,
    });
    expect(aiQueueService.enqueueEmbed).not.toHaveBeenCalled();
  });
});
