import { normalizeRequiredText } from '@src/core/common/input-normalize/input-normalize.policy';
import { AsyncTaskRecordQueryService } from '@src/modules/async-task-record/queries/async-task-record.query.service';
import { Injectable } from '@nestjs/common';
import type {
  GetAsyncTaskRecordByQueueJobInput,
  GetAsyncTaskRecordByQueueJobResult,
} from './get-async-task-record-by-queue-job.types';

@Injectable()
export class GetAsyncTaskRecordByQueueJobUsecase {
  constructor(private readonly asyncTaskRecordQueryService: AsyncTaskRecordQueryService) {}

  async execute(
    input: GetAsyncTaskRecordByQueueJobInput,
  ): Promise<GetAsyncTaskRecordByQueueJobResult> {
    const queueName = normalizeRequiredText(input.queueName, { fieldName: 'queueName' });
    const jobId = normalizeRequiredText(input.jobId, { fieldName: 'jobId' });

    return await this.asyncTaskRecordQueryService.findByQueueJob({
      where: {
        queueName,
        jobId,
      },
    });
  }
}
