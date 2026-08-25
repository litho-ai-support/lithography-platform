// src/modules/async-task-record/queries/async-task-record.query.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type FindOptionsWhere, In, IsNull, Repository } from 'typeorm';
import { AsyncTaskRecordEntity } from '../async-task-record.entity';
import {
  CAPABILITY_STATE_READER,
  type CapabilityStateReader,
} from '@src/modules/common/capability-state-reader.contract';
import type {
  AsyncTaskRecordStatus,
  AsyncTaskRecordView,
  FindAsyncTaskRecordByQueueJobInput,
  ListAsyncTaskRecordsByBizTargetInput,
  ListAsyncTaskRecordsByTraceInput,
} from '../async-task-record.types';

@Injectable()
export class AsyncTaskRecordQueryService {
  constructor(
    @InjectRepository(AsyncTaskRecordEntity)
    private readonly asyncTaskRecordRepository: Repository<AsyncTaskRecordEntity>,
    @Inject(CAPABILITY_STATE_READER)
    private readonly capabilityStateReader: CapabilityStateReader,
  ) {}

  async findById(input: { readonly id: number }): Promise<AsyncTaskRecordView | null> {
    this.capabilityStateReader.requireEnabled('runtime.async-task');
    const entity = await this.asyncTaskRecordRepository.findOne({ where: { id: input.id } });
    return entity ? this.toView(entity) : null;
  }

  async findByQueueJob(input: {
    readonly where: FindAsyncTaskRecordByQueueJobInput;
  }): Promise<AsyncTaskRecordView | null> {
    this.capabilityStateReader.requireEnabled('runtime.async-task');
    const entity = await this.asyncTaskRecordRepository.findOne({ where: input.where });
    return entity ? this.toView(entity) : null;
  }

  async listByTraceId(input: {
    readonly where: ListAsyncTaskRecordsByTraceInput;
  }): Promise<AsyncTaskRecordView[]> {
    this.capabilityStateReader.requireEnabled('runtime.async-task');
    const where: FindOptionsWhere<AsyncTaskRecordEntity> = {
      traceId: input.where.traceId,
    };
    if (input.where.queueName !== undefined) {
      where.queueName = input.where.queueName;
    }
    if (input.where.bizTypes && input.where.bizTypes.length > 0) {
      where.bizType = In([...input.where.bizTypes]);
    }
    const entities = await this.asyncTaskRecordRepository.find({
      where,
      order: { id: 'DESC' },
      take: input.where.limit,
    });
    return entities.map((entity) => this.toView(entity));
  }

  async listByBizTarget(input: {
    readonly where: ListAsyncTaskRecordsByBizTargetInput;
  }): Promise<AsyncTaskRecordView[]> {
    this.capabilityStateReader.requireEnabled('runtime.async-task');
    const where: FindOptionsWhere<AsyncTaskRecordEntity> = {
      bizType: input.where.bizType,
      bizKey: input.where.bizKey,
    };
    if (input.where.queueName !== undefined) {
      where.queueName = input.where.queueName;
    }

    if (input.where.bizSubKey !== undefined) {
      where.bizSubKey = input.where.bizSubKey === null ? IsNull() : input.where.bizSubKey;
    }

    if (input.where.statuses && input.where.statuses.length > 0) {
      where.status = In([...input.where.statuses]);
    }

    const entities = await this.asyncTaskRecordRepository.find({
      where,
      order: { id: 'DESC' },
      take: input.where.limit,
    });
    return entities.map((entity) => this.toView(entity));
  }

  async countByStatus(input: {
    readonly statuses: ReadonlyArray<AsyncTaskRecordStatus>;
  }): Promise<number> {
    this.capabilityStateReader.requireEnabled('runtime.async-task');
    if (input.statuses.length === 0) {
      return 0;
    }
    return await this.asyncTaskRecordRepository.count({
      where: { status: In([...input.statuses]) },
    });
  }

  async hasActiveTaskByBizTarget(input: {
    readonly bizType: string;
    readonly bizKey: string;
    readonly bizSubKey?: string | null;
  }): Promise<boolean> {
    this.capabilityStateReader.requireEnabled('runtime.async-task');
    const records = await this.listByBizTarget({
      where: {
        bizType: input.bizType,
        bizKey: input.bizKey,
        bizSubKey: input.bizSubKey,
        statuses: ['queued', 'processing'],
        limit: 1,
      },
    });
    return records.length > 0;
  }

  private toView(entity: AsyncTaskRecordEntity): AsyncTaskRecordView {
    return {
      id: entity.id,
      queueName: entity.queueName,
      jobName: entity.jobName,
      jobId: entity.jobId,
      traceId: entity.traceId,
      actorAccountId: entity.actorAccountId,
      actorActiveRole: entity.actorActiveRole,
      bizType: entity.bizType,
      bizKey: entity.bizKey,
      bizSubKey: entity.bizSubKey,
      source: entity.source,
      reason: entity.reason,
      occurredAt: entity.occurredAt,
      dedupKey: entity.dedupKey,
      status: entity.status,
      attemptCount: entity.attemptCount,
      maxAttempts: entity.maxAttempts,
      enqueuedAt: entity.enqueuedAt,
      startedAt: entity.startedAt,
      finishedAt: entity.finishedAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };
  }
}
