import { Module } from '@nestjs/common';
import { AsyncTaskRecordModule } from '@src/modules/async-task-record/async-task-record.module';
import { GetAsyncTaskRecordByQueueJobUsecase } from './get-async-task-record-by-queue-job.usecase';
import { ListAsyncTaskRecordsByBizTargetUsecase } from './list-async-task-records-by-biz-target.usecase';
import { ListAsyncTaskRecordsByTraceIdUsecase } from './list-async-task-records-by-trace-id.usecase';

@Module({
  imports: [AsyncTaskRecordModule],
  providers: [
    GetAsyncTaskRecordByQueueJobUsecase,
    ListAsyncTaskRecordsByTraceIdUsecase,
    ListAsyncTaskRecordsByBizTargetUsecase,
  ],
  exports: [
    GetAsyncTaskRecordByQueueJobUsecase,
    ListAsyncTaskRecordsByTraceIdUsecase,
    ListAsyncTaskRecordsByBizTargetUsecase,
  ],
})
export class AsyncTaskRecordUsecasesModule {}
