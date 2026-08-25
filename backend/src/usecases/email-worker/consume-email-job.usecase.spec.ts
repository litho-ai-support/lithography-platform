import type { AsyncTaskRecordService } from '@src/modules/async-task-record/async-task-record.service';
import type { EmailDeliveryService } from '@src/modules/common/email-worker/email-delivery.service';
import { ConsumeEmailJobUsecase } from './consume-email-job.usecase';

describe(ConsumeEmailJobUsecase.name, () => {
  it('delivers and warns when optional Async Task observation fails unexpectedly', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const emailDeliveryService = {
      send: jest.fn().mockResolvedValue({ accepted: true, providerMessageId: 'message-1' }),
    };
    const asyncTaskRecordService = {
      recordStarted: jest.fn().mockRejectedValue(new Error('audit disabled')),
    };
    const usecase = new ConsumeEmailJobUsecase(
      emailDeliveryService as unknown as EmailDeliveryService,
      asyncTaskRecordService as unknown as AsyncTaskRecordService,
    );

    await expect(
      usecase.process({
        queueName: 'email',
        jobName: 'send',
        jobId: 'job-1',
        traceId: 'trace-1',
        payload: { to: 'user@example.com', subject: 'hello', text: 'body' },
        attemptsMade: 0,
      }),
    ).resolves.toEqual({ accepted: true, providerMessageId: 'message-1' });
    expect(emailDeliveryService.send).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Optional Async Task audit failed during email delivery',
      }),
    );
  });
});
import { Logger } from '@nestjs/common';
