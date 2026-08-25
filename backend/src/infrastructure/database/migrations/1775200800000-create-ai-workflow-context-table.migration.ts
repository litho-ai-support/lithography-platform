import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiWorkflowContextTable1775200800000 implements MigrationInterface {
  name = 'CreateAiWorkflowContextTable1775200800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`ai_workflow_context\` (
        \`workflow_id\` varchar(36) NOT NULL COMMENT 'workflow 主标识；系统生成 UUID',
        \`workflow_type\` varchar(128) NOT NULL COMMENT 'workflow 类型',
        \`workflow_dedup_hash\` binary(32) DEFAULT NULL COMMENT 'workflow 幂等键 SHA-256；不保存原始 key',
        \`workflow_dedup_active_hash\` binary(32) DEFAULT NULL COMMENT '未终态 workflow 幂等键 SHA-256；终态后清空',
        \`trace_id\` varchar(128) NOT NULL COMMENT '异步链路追踪 ID',
        \`queue_name\` varchar(64) DEFAULT NULL COMMENT '队列名称',
        \`job_name\` varchar(128) DEFAULT NULL COMMENT '任务名称',
        \`job_id\` varchar(191) DEFAULT NULL COMMENT 'BullMQ jobId',
        \`async_task_record_id\` int DEFAULT NULL COMMENT '关联 base_async_task_record.id；成功入队后回填',
        \`biz_type\` varchar(64) NOT NULL COMMENT '真实业务对象类型',
        \`biz_key\` varchar(128) NOT NULL COMMENT '真实业务对象主键',
        \`biz_sub_key\` varchar(128) DEFAULT NULL COMMENT '真实业务对象子键',
        \`source\` enum('user_action','admin_action','system','cron','domain_event','webhook') NOT NULL COMMENT '触发来源快照',
        \`actor_account_id\` int DEFAULT NULL COMMENT '发起账号ID',
        \`actor_active_role\` varchar(64) DEFAULT NULL COMMENT '发起时角色快照',
        \`provider\` varchar(64) DEFAULT NULL COMMENT 'workflow policy 解析后的 provider 快照',
        \`model\` varchar(128) DEFAULT NULL COMMENT 'workflow policy 解析后的 model 快照',
        \`status\` enum('CREATED','ADMISSION_WAITING','QUEUED','PROCESSING','SUCCEEDED','FAILED','CANCELLED') NOT NULL DEFAULT 'CREATED' COMMENT 'workflow 执行状态',
        \`input_payload_json\` json NOT NULL COMMENT '非敏感小型 input payload；敏感场景由下游替换存储策略',
        \`output_payload_json\` json DEFAULT NULL COMMENT '非敏感小型 output payload；未产生时为空',
        \`admission_attempt_count\` int unsigned NOT NULL DEFAULT '0' COMMENT 'admission 提交尝试次数',
        \`next_enqueue_at\` timestamp(3) NULL DEFAULT NULL COMMENT '下次 admission 重试时间（系统事件时间）',
        \`admission_expires_at\` timestamp(3) NULL DEFAULT NULL COMMENT 'admission / enqueue repair 最晚截止时间（系统事件时间）',
        \`admission_reason\` varchar(128) DEFAULT NULL COMMENT 'admission waiting 的稳定原因摘要',
        \`error_code\` varchar(64) DEFAULT NULL COMMENT '终态失败/取消稳定错误码',
        \`error_message\` varchar(512) DEFAULT NULL COMMENT '终态失败/取消错误摘要',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）',
        PRIMARY KEY (\`workflow_id\`),
        UNIQUE KEY \`uk_ai_workflow_context_type_active_dedup_hash\` (\`workflow_type\`,\`workflow_dedup_active_hash\`),
        UNIQUE KEY \`uk_ai_workflow_context_queue_job\` (\`queue_name\`,\`job_id\`),
        KEY \`idx_ai_workflow_context_status_next_enqueue\` (\`status\`,\`next_enqueue_at\`),
        KEY \`idx_ai_workflow_context_type_status_created\` (\`workflow_type\`,\`status\`,\`created_at\`),
        KEY \`idx_ai_workflow_context_type_dedup_status\` (\`workflow_type\`,\`workflow_dedup_hash\`,\`status\`),
        KEY \`idx_ai_workflow_context_trace_id\` (\`trace_id\`),
        KEY \`idx_ai_workflow_context_biz_target\` (\`biz_type\`,\`biz_key\`,\`biz_sub_key\`),
        KEY \`idx_ai_workflow_context_status_updated\` (\`status\`,\`updated_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI workflow 最小上下文状态账本';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `ai_workflow_context`;');
  }
}
