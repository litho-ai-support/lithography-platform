// src/modules/async-task-record/async-task-record.entity.ts

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  ASYNC_TASK_RECORD_SOURCES,
  ASYNC_TASK_RECORD_STATUSES,
  type AsyncTaskRecordSource,
  type AsyncTaskRecordStatus,
} from './async-task-record.types';

@Entity('base_async_task_record')
@Index('uk_queue_name_job_id', ['queueName', 'jobId'], { unique: true })
@Index('idx_trace_id', ['traceId'])
@Index('idx_actor_account_id', ['actorAccountId'])
@Index('idx_biz_target', ['bizType', 'bizKey', 'bizSubKey'])
@Index('idx_source', ['source'])
@Index('idx_reason', ['reason'])
@Index('idx_status_enqueued_at', ['status', 'enqueuedAt'])
@Index('idx_dedup_key_status', ['dedupKey', 'status'])
@Index('idx_occurred_at', ['occurredAt'])
@Index('idx_finished_at', ['finishedAt'])
export class AsyncTaskRecordEntity {
  @PrimaryGeneratedColumn({ type: 'int', comment: '主键ID' })
  id!: number;

  @Column({ name: 'queue_name', type: 'varchar', length: 64, comment: '队列名称' })
  queueName!: string;

  @Column({ name: 'job_name', type: 'varchar', length: 128, comment: '任务名称' })
  jobName!: string;

  @Column({ name: 'job_id', type: 'varchar', length: 191, comment: 'BullMQ任务ID' })
  jobId!: string;

  @Column({ name: 'trace_id', type: 'varchar', length: 128, comment: '链路追踪ID' })
  traceId!: string;

  @Column({ name: 'actor_account_id', type: 'int', nullable: true, comment: '发起账号ID' })
  actorAccountId!: number | null;

  @Column({
    name: 'actor_active_role',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '发起时角色快照',
  })
  actorActiveRole!: string | null;

  @Column({ name: 'biz_type', type: 'varchar', length: 64, comment: '目标对象类型' })
  bizType!: string;

  @Column({ name: 'biz_key', type: 'varchar', length: 128, comment: '目标对象主键' })
  bizKey!: string;

  @Column({
    name: 'biz_sub_key',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '目标对象子键',
  })
  bizSubKey!: string | null;

  @Column({
    type: 'enum',
    enum: ASYNC_TASK_RECORD_SOURCES,
    comment: '触发来源',
  })
  source!: AsyncTaskRecordSource;

  @Column({
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '触发原因，当前探索期使用 varchar，稳定后 enum',
  })
  reason!: string | null;

  @Column({
    name: 'occurred_at',
    type: 'timestamp',
    precision: 3,
    nullable: true,
    comment: '事件设定时间（系统事件时间）',
  })
  occurredAt!: Date | null;

  @Column({
    name: 'dedup_key',
    type: 'varchar',
    length: 191,
    nullable: true,
    comment: '幂等去重键',
  })
  dedupKey!: string | null;

  @Column({
    type: 'enum',
    enum: ASYNC_TASK_RECORD_STATUSES,
    comment: '任务状态',
  })
  status!: AsyncTaskRecordStatus;

  @Column({ name: 'attempt_count', type: 'int', unsigned: true, default: 0, comment: '已执行次数' })
  attemptCount!: number;

  @Column({
    name: 'max_attempts',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: '最大允许执行次数',
  })
  maxAttempts!: number | null;

  @Column({
    name: 'enqueued_at',
    type: 'timestamp',
    precision: 3,
    comment: '入队时间（系统事件时间）',
  })
  enqueuedAt!: Date;

  @Column({
    name: 'started_at',
    type: 'timestamp',
    precision: 3,
    nullable: true,
    comment: '开始执行时间（系统事件时间）',
  })
  startedAt!: Date | null;

  @Column({
    name: 'finished_at',
    type: 'timestamp',
    precision: 3,
    nullable: true,
    comment: '完成时间（系统事件时间）',
  })
  finishedAt!: Date | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    comment: '创建时间（系统事件时间）',
  })
  createdAt!: Date;

  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
    comment: '更新时间（系统事件时间）',
  })
  updatedAt!: Date;
}
