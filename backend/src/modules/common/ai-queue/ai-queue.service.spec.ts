import { BULLMQ_JOBS, BULLMQ_QUEUES } from '@src/infrastructure/bullmq/bullmq.constants';
import { BullMqProducerGateway } from '@src/infrastructure/bullmq/producer.gateway';
import type { PinoLogger } from 'nestjs-pino';
import {
  createDisabledCapabilityStateReader,
  createEnabledCapabilityStateReader,
} from '../../../../test/support/capability/capability-state-reader.fixture';
import { AiQueueService } from './ai-queue.service';

describe(AiQueueService.name, () => {
  const createHarness = (disabled = false) => {
    const producer = {
      enqueue: jest.fn().mockResolvedValue({ jobId: 'job-1', traceId: 'trace-1' }),
    };
    const logger = { setContext: jest.fn(), info: jest.fn() };
    const service = new AiQueueService(
      producer as unknown as BullMqProducerGateway,
      logger as unknown as PinoLogger,
      disabled
        ? createDisabledCapabilityStateReader('ai.execution')
        : createEnabledCapabilityStateReader(),
    );
    return { producer, service };
  };

  it('keeps generate and embed admission on the execution queue', async () => {
    const { producer, service } = createHarness();

    await service.enqueueGenerate({
      provider: 'openai',
      model: 'gpt-4.1-mini',
      prompt: 'hello',
      dedupKey: 'dedup-1',
      traceId: 'trace-generate',
    });
    await service.enqueueEmbed({
      model: 'text-embedding-3-small',
      text: 'hello',
      dedupKey: 'dedup-2',
      traceId: 'trace-embed',
    });

    expect(producer.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        queueName: BULLMQ_QUEUES.AI,
        jobName: BULLMQ_JOBS.AI.GENERATE,
      }),
    );
    expect(producer.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        queueName: BULLMQ_QUEUES.AI,
        jobName: BULLMQ_JOBS.AI.EMBED,
      }),
    );
  });

  it('rejects disabled execution admission before touching BullMQ', async () => {
    const { producer, service } = createHarness(true);

    await expect(
      service.enqueueGenerate({ model: 'model', prompt: 'hello' }),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNAVAILABLE' });
    expect(producer.enqueue).not.toHaveBeenCalled();
  });
});
