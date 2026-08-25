// src/modules/ai-workflow-context/ai-workflow-context.entity.ts
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import {
  AI_WORKFLOW_CONTEXT_SOURCES,
  AI_WORKFLOW_CONTEXT_STATUSES,
  type AiWorkflowContextSource,
  type AiWorkflowContextStatus,
} from './ai-workflow-context.types';

type JsonColumnPayload = object | string | number | boolean;

@Entity('ai_workflow_context')
@Index(
  'uk_ai_workflow_context_type_active_dedup_hash',
  ['workflowType', 'workflowDedupActiveHash'],
  { unique: true },
)
@Index('uk_ai_workflow_context_queue_job', ['queueName', 'jobId'], { unique: true })
@Index('idx_ai_workflow_context_status_next_enqueue', ['status', 'nextEnqueueAt'])
@Index('idx_ai_workflow_context_type_status_created', ['workflowType', 'status', 'createdAt'])
@Index('idx_ai_workflow_context_type_dedup_status', ['workflowType', 'workflowDedupHash', 'status'])
@Index('idx_ai_workflow_context_trace_id', ['traceId'])
@Index('idx_ai_workflow_context_biz_target', ['bizType', 'bizKey', 'bizSubKey'])
@Index('idx_ai_workflow_context_status_updated', ['status', 'updatedAt'])
export class AiWorkflowContextEntity {
  @PrimaryColumn({
    name: 'workflow_id',
    type: 'varchar',
    length: 36,
    comment: 'workflow 主标识；系统生成 UUID',
  })
  workflowId!: string;

  @Column({ name: 'workflow_type', type: 'varchar', length: 128, comment: 'workflow 类型' })
  workflowType!: string;

  @Column({
    name: 'workflow_dedup_hash',
    type: 'binary',
    length: 32,
    nullable: true,
    comment: 'workflow 幂等键 SHA-256；不保存原始 key',
  })
  workflowDedupHash!: Buffer | null;

  @Column({
    name: 'workflow_dedup_active_hash',
    type: 'binary',
    length: 32,
    nullable: true,
    comment: '未终态 workflow 幂等键 SHA-256；终态后清空',
  })
  workflowDedupActiveHash!: Buffer | null;

  @Column({ name: 'trace_id', type: 'varchar', length: 128, comment: '异步链路追踪 ID' })
  traceId!: string;

  @Column({ name: 'queue_name', type: 'varchar', length: 64, nullable: true, comment: '队列名称' })
  queueName!: string | null;

  @Column({ name: 'job_name', type: 'varchar', length: 128, nullable: true, comment: '任务名称' })
  jobName!: string | null;

  @Column({ name: 'job_id', type: 'varchar', length: 191, nullable: true, comment: 'BullMQ jobId' })
  jobId!: string | null;

  @Column({
    name: 'async_task_record_id',
    type: 'int',
    nullable: true,
    comment: '关联 base_async_task_record.id；成功入队后回填',
  })
  asyncTaskRecordId!: number | null;

  @Column({ name: 'biz_type', type: 'varchar', length: 64, comment: '真实业务对象类型' })
  bizType!: string;

  @Column({ name: 'biz_key', type: 'varchar', length: 128, comment: '真实业务对象主键' })
  bizKey!: string;

  @Column({
    name: 'biz_sub_key',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '真实业务对象子键',
  })
  bizSubKey!: string | null;

  @Column({ type: 'enum', enum: AI_WORKFLOW_CONTEXT_SOURCES, comment: '触发来源快照' })
  source!: AiWorkflowContextSource;

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

  @Column({
    name: 'provider',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: 'workflow policy 解析后的 provider 快照',
  })
  provider!: string | null;

  @Column({
    name: 'model',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: 'workflow policy 解析后的 model 快照',
  })
  model!: string | null;

  @Column({
    type: 'enum',
    enum: AI_WORKFLOW_CONTEXT_STATUSES,
    default: 'CREATED',
    comment: 'workflow 执行状态',
  })
  status!: AiWorkflowContextStatus;

  @Column({
    name: 'input_payload_json',
    type: 'json',
    comment: '非敏感小型 input payload；敏感场景由下游替换存储策略',
  })
  inputPayloadJson!: JsonColumnPayload;

  @Column({
    name: 'output_payload_json',
    type: 'json',
    nullable: true,
    comment: '非敏感小型 output payload；未产生时为空',
  })
  outputPayloadJson!: JsonColumnPayload | null;

  @Column({
    name: 'admission_attempt_count',
    type: 'int',
    unsigned: true,
    default: 0,
    comment: 'admission 提交尝试次数',
  })
  admissionAttemptCount!: number;

  @Column({
    name: 'next_enqueue_at',
    type: 'timestamp',
    precision: 3,
    nullable: true,
    comment: '下次 admission 重试时间（系统事件时间）',
  })
  nextEnqueueAt!: Date | null;

  @Column({
    name: 'admission_expires_at',
    type: 'timestamp',
    precision: 3,
    nullable: true,
    comment: 'admission / enqueue repair 最晚截止时间（系统事件时间）',
  })
  admissionExpiresAt!: Date | null;

  @Column({
    name: 'admission_reason',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: 'admission waiting 的稳定原因摘要',
  })
  admissionReason!: string | null;

  @Column({
    name: 'error_code',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '终态失败/取消稳定错误码',
  })
  errorCode!: string | null;

  @Column({
    name: 'error_message',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '终态失败/取消错误摘要',
  })
  errorMessage!: string | null;

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
