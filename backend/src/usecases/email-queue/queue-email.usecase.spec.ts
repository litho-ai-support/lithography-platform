import { Logger } from '@nestjs/common';
import { CAPABILITY_ERROR, DomainError } from '@src/core/common/errors/domain-error';
import type { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { EmailQueueService } from '@src/modules/common/email-queue/email-queue.service';
import { QueueEmailUsecase } from './queue-email.usecase';

describe(QueueEmailUsecase.name, () => {
  it('normalizes required and optional blank text with explicit usecase policies', async () => {
    const emailQueueService = {
      enqueueSend: jest.fn().mockResolvedValue({ jobId: 'job-1', traceId: 'trace-1' }),
    };
    const asyncTaskRecordService = {
      recordEnqueued: jest.fn().mockResolvedValue(undefined),
    };
    const usecase = new QueueEmailUsecase(
      emailQueueService as unknown as EmailQueueService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
    );

    await usecase.execute({
      to: '  user@example.com  ',
      subject: '  hello  ',
      text: '   ',
      html: null,
      dedupKey: '   ',
      traceId: ' trace-1 ',
    });

    expect(emailQueueService.enqueueSend).toHaveBeenCalledWith({
      to: 'user@example.com',
      subject: 'hello',
      text: undefined,
      html: undefined,
      templateId: undefined,
      meta: undefined,
      dedupKey: undefined,
      traceId: 'trace-1',
    });
  });

  it('keeps accepted admission authoritative and warns when optional audit fails unexpectedly', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const emailQueueService = {
      enqueueSend: jest.fn().mockResolvedValue({ jobId: 'job-1', traceId: 'trace-1' }),
    };
    const asyncTaskRecordService = {
      recordEnqueued: jest.fn().mockRejectedValue(new Error('audit disabled')),
    };
    const usecase = new QueueEmailUsecase(
      emailQueueService as unknown as EmailQueueService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
    );

    await expect(
      usecase.execute({ to: 'user@example.com', subject: 'hello', text: 'body' }),
    ).resolves.toEqual({ jobId: 'job-1', traceId: 'trace-1' });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Optional Async Task audit failed during email admission',
      }),
    );
  });

  it('silently tolerates expected capability unavailability', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const emailQueueService = {
      enqueueSend: jest.fn().mockResolvedValue({ jobId: 'job-1', traceId: 'trace-1' }),
    };
    const asyncTaskRecordService = {
      recordEnqueued: jest
        .fn()
        .mockRejectedValue(new DomainError(CAPABILITY_ERROR.UNAVAILABLE, 'Async Task is disabled')),
    };
    const usecase = new QueueEmailUsecase(
      emailQueueService as unknown as EmailQueueService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
    );

    await expect(
      usecase.execute({ to: 'user@example.com', subject: 'hello', text: 'body' }),
    ).resolves.toEqual({ jobId: 'job-1', traceId: 'trace-1' });
    expect(warn).not.toHaveBeenCalled();
  });
});
