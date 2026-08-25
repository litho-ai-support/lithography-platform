import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiProviderCallRecordTable1773889200000 implements MigrationInterface {
  name = 'CreateAiProviderCallRecordTable1773889200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`ai_provider_call_record\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
        \`async_task_record_id\` int DEFAULT NULL COMMENT '关联异步任务记录ID；可为空以支持非队列直调场景',
        \`trace_id\` varchar(128) NOT NULL COMMENT '任务级/调用链级追踪ID；不是HTTP requestId',
        \`call_seq\` smallint unsigned NOT NULL COMMENT '同一 trace_id 内的 provider 调用序号，从 1 开始；由上游程序负责分配',
        \`account_id\` int DEFAULT NULL COMMENT '发起账号ID',
        \`nickname_snapshot\` varchar(128) DEFAULT NULL COMMENT '发起时昵称快照',
        \`biz_type\` varchar(64) DEFAULT NULL COMMENT '真实业务对象类型',
        \`biz_key\` varchar(128) DEFAULT NULL COMMENT '真实业务对象主键',
        \`biz_sub_key\` varchar(128) DEFAULT NULL COMMENT '真实业务对象子键',
        \`source\` enum('user_action','admin_action','system','cron','domain_event','webhook') NOT NULL COMMENT '触发来源快照',
        \`provider\` varchar(32) NOT NULL COMMENT 'AI提供商，如 openai / qwen / dashscope / sglang',
        \`model\` varchar(128) NOT NULL COMMENT '模型标识',
        \`task_type\` varchar(32) NOT NULL COMMENT 'AI任务类型，如 generate / embed / rerank / classify',
        \`provider_request_id\` varchar(128) DEFAULT NULL COMMENT '第三方请求ID/响应ID',
        \`provider_status\` enum('succeeded','failed') NOT NULL COMMENT '本次 provider 调用结果状态',
        \`prompt_tokens\` int unsigned DEFAULT NULL COMMENT '输入 token 数；未知时为 NULL',
        \`completion_tokens\` int unsigned DEFAULT NULL COMMENT '输出 token 数；未知时为 NULL',
        \`total_tokens\` int unsigned DEFAULT NULL COMMENT '总 token 数；由上游程序负责计算，未知时为 NULL',
        \`cost_amount\` decimal(18,8) DEFAULT NULL COMMENT '消费金额；未知时为 NULL',
        \`cost_currency\` char(3) DEFAULT NULL COMMENT '币种；未知时为 NULL',
        \`normalized_error_code\` varchar(64) DEFAULT NULL COMMENT '内部归一化错误码',
        \`provider_error_code\` varchar(128) DEFAULT NULL COMMENT '上游 provider 原始错误码',
        \`error_message\` varchar(512) DEFAULT NULL COMMENT '错误摘要',
        \`provider_started_at\` timestamp(3) NULL DEFAULT NULL COMMENT '调用 AI 开始时间（系统事件时间）',
        \`provider_finished_at\` timestamp(3) NULL DEFAULT NULL COMMENT '调用 AI 结束时间（系统事件时间）',
        \`provider_latency_ms\` int unsigned DEFAULT NULL COMMENT 'AI 调用耗时(ms)；由上游按 provider_finished_at - provider_started_at 负责写入',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_ai_provider_call_trace_seq\` (\`trace_id\`,\`call_seq\`),
        KEY \`idx_ai_provider_call_async_task_record_id\` (\`async_task_record_id\`),
        KEY \`idx_ai_provider_call_async_task_record_seq\` (\`async_task_record_id\`,\`call_seq\`),
        KEY \`idx_ai_provider_call_account_created_at\` (\`account_id\`,\`created_at\`),
        KEY \`idx_ai_provider_call_biz_target\` (\`biz_type\`,\`biz_key\`,\`biz_sub_key\`),
        KEY \`idx_ai_provider_call_source_created_at\` (\`source\`,\`created_at\`),
        KEY \`idx_ai_provider_call_provider_model_created_at\` (\`provider\`,\`model\`,\`created_at\`),
        KEY \`idx_ai_provider_call_task_type_created_at\` (\`task_type\`,\`created_at\`),
        KEY \`idx_ai_provider_call_provider_status_created_at\` (\`provider_status\`,\`created_at\`),
        KEY \`idx_ai_provider_call_provider_request_id\` (\`provider_request_id\`),
        KEY \`idx_ai_provider_call_normalized_error_code\` (\`normalized_error_code\`),
        KEY \`idx_ai_provider_call_provider_error_code\` (\`provider_error_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI provider 调用记录表';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `ai_provider_call_record`;');
  }
}
