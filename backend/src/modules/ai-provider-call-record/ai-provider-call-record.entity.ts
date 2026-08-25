import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  AI_PROVIDER_CALL_RECORD_PROVIDER_STATUSES,
  AI_PROVIDER_CALL_RECORD_SOURCES,
  type AiProviderCallRecordProviderStatus,
  type AiProviderCallRecordSource,
} from './ai-provider-call-record.types';

@Entity('ai_provider_call_record', { comment: 'AI provider 调用记录表' })
@Index('uk_ai_provider_call_trace_seq', ['traceId', 'callSeq'], { unique: true })
@Index('idx_ai_provider_call_async_task_record_id', ['asyncTaskRecordId'])
@Index('idx_ai_provider_call_async_task_record_seq', ['asyncTaskRecordId', 'callSeq'])
@Index('idx_ai_provider_call_account_created_at', ['accountId', 'createdAt'])
@Index('idx_ai_provider_call_biz_target', ['bizType', 'bizKey', 'bizSubKey'])
@Index('idx_ai_provider_call_source_created_at', ['source', 'createdAt'])
@Index('idx_ai_provider_call_provider_model_created_at', ['provider', 'model', 'createdAt'])
@Index('idx_ai_provider_call_task_type_created_at', ['taskType', 'createdAt'])
@Index('idx_ai_provider_call_provider_status_created_at', ['providerStatus', 'createdAt'])
@Index('idx_ai_provider_call_provider_request_id', ['providerRequestId'])
@Index('idx_ai_provider_call_normalized_error_code', ['normalizedErrorCode'])
@Index('idx_ai_provider_call_provider_error_code', ['providerErrorCode'])
export class AiProviderCallRecordEntity {
  @PrimaryGeneratedColumn({
    type: 'int',
    comment: '主键ID',
  })
  id!: number;

  @Column({
    name: 'async_task_record_id',
    type: 'int',
    nullable: true,
    comment: '关联异步任务记录ID；可为空以支持非队列直调场景',
  })
  asyncTaskRecordId!: number | null;

  @Column({
    name: 'trace_id',
    type: 'varchar',
    length: 128,
    nullable: false,
    comment: '任务级/调用链级追踪ID；不是HTTP requestId',
  })
  traceId!: string;

  @Column({
    name: 'call_seq',
    type: 'smallint',
    unsigned: true,
    nullable: false,
    comment: '同一 trace_id 内的 provider 调用序号，从 1 开始；由上游程序负责分配',
  })
  callSeq!: number;

  @Column({
    name: 'account_id',
    type: 'int',
    nullable: true,
    comment: '发起账号ID',
  })
  accountId!: number | null;

  @Column({
    name: 'nickname_snapshot',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '发起时昵称快照',
  })
  nicknameSnapshot!: string | null;

  @Column({
    name: 'biz_type',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '真实业务对象类型',
  })
  bizType!: string | null;

  @Column({
    name: 'biz_key',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '真实业务对象主键',
  })
  bizKey!: string | null;

  @Column({
    name: 'biz_sub_key',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '真实业务对象子键',
  })
  bizSubKey!: string | null;

  @Column({
    name: 'source',
    type: 'enum',
    enum: AI_PROVIDER_CALL_RECORD_SOURCES,
    nullable: false,
    comment: '触发来源快照',
  })
  source!: AiProviderCallRecordSource;

  @Column({
    name: 'provider',
    type: 'varchar',
    length: 32,
    nullable: false,
    comment: 'AI提供商，如 openai / qwen / dashscope / sglang',
  })
  provider!: string;

  @Column({
    name: 'model',
    type: 'varchar',
    length: 128,
    nullable: false,
    comment: '模型标识',
  })
  model!: string;

  @Column({
    name: 'task_type',
    type: 'varchar',
    length: 32,
    nullable: false,
    comment: 'AI任务类型，如 generate / embed / rerank / classify',
  })
  taskType!: string;

  @Column({
    name: 'provider_request_id',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '第三方请求ID/响应ID',
  })
  providerRequestId!: string | null;

  @Column({
    name: 'provider_status',
    type: 'enum',
    enum: AI_PROVIDER_CALL_RECORD_PROVIDER_STATUSES,
    nullable: false,
    comment: '本次 provider 调用结果状态',
  })
  providerStatus!: AiProviderCallRecordProviderStatus;

  @Column({
    name: 'prompt_tokens',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: '输入 token 数；未知时为 NULL',
  })
  promptTokens!: number | null;

  @Column({
    name: 'completion_tokens',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: '输出 token 数；未知时为 NULL',
  })
  completionTokens!: number | null;

  @Column({
    name: 'total_tokens',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: '总 token 数；由上游程序负责计算，未知时为 NULL',
  })
  totalTokens!: number | null;

  @Column({
    name: 'cost_amount',
    type: 'decimal',
    precision: 18,
    scale: 8,
    nullable: true,
    comment: '消费金额；未知时为 NULL',
  })
  costAmount!: string | null;

  @Column({
    name: 'cost_currency',
    type: 'char',
    length: 3,
    nullable: true,
    comment: '币种；未知时为 NULL',
  })
  costCurrency!: string | null;

  @Column({
    name: 'normalized_error_code',
    type: 'varchar',
    length: 64,
    nullable: true,
    comment: '内部归一化错误码',
  })
  normalizedErrorCode!: string | null;

  @Column({
    name: 'provider_error_code',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '上游 provider 原始错误码',
  })
  providerErrorCode!: string | null;

  @Column({
    name: 'error_message',
    type: 'varchar',
    length: 512,
    nullable: true,
    comment: '错误摘要',
  })
  errorMessage!: string | null;

  @Column({
    name: 'provider_started_at',
    type: 'timestamp',
    precision: 3,
    nullable: true,
    comment: '调用 AI 开始时间（系统事件时间）',
  })
  providerStartedAt!: Date | null;

  @Column({
    name: 'provider_finished_at',
    type: 'timestamp',
    precision: 3,
    nullable: true,
    comment: '调用 AI 结束时间（系统事件时间）',
  })
  providerFinishedAt!: Date | null;

  @Column({
    name: 'provider_latency_ms',
    type: 'int',
    unsigned: true,
    nullable: true,
    comment: 'AI 调用耗时(ms)；由上游按 provider_finished_at - provider_started_at 负责写入',
  })
  providerLatencyMs!: number | null;

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
