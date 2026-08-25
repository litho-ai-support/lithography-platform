// src/modules/async-task-record/async-task-record.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AsyncTaskRecordEntity } from './async-task-record.entity';
import { AsyncTaskRecordService } from './async-task-record.service';
import { AsyncTaskRecordQueryService } from './queries/async-task-record.query.service';
import { RuntimeAsyncTaskCapabilityAnchor } from './async-task-record.capability';

@Module({
  imports: [TypeOrmModule.forFeature([AsyncTaskRecordEntity])],
  providers: [
    RuntimeAsyncTaskCapabilityAnchor,
    AsyncTaskRecordService,
    AsyncTaskRecordQueryService,
  ],
  exports: [TypeOrmModule, AsyncTaskRecordService, AsyncTaskRecordQueryService],
})
export class AsyncTaskRecordModule {}
