import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBaseAsyncTaskRecordTable1773925700000 implements MigrationInterface {
  name = 'CreateBaseAsyncTaskRecordTable1773925700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`base_async_task_record\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT '主键ID',
        \`queue_name\` varchar(64) NOT NULL COMMENT '队列名称',
        \`job_name\` varchar(128) NOT NULL COMMENT '任务名称',
        \`job_id\` varchar(191) NOT NULL COMMENT 'BullMQ任务ID',
        \`trace_id\` varchar(128) NOT NULL COMMENT '链路追踪 ID',
        \`actor_account_id\` int DEFAULT NULL COMMENT '发起账号ID',
        \`actor_active_role\` varchar(64) DEFAULT NULL COMMENT '发起时角色快照',
        \`biz_type\` varchar(64) NOT NULL COMMENT '目标对象类型',
        \`biz_key\` varchar(128) NOT NULL COMMENT '目标对象主键',
        \`biz_sub_key\` varchar(128) DEFAULT NULL COMMENT '目标对象子键',
        \`source\` enum('user_action','admin_action','system','cron','domain_event','webhook') NOT NULL COMMENT '触发来源',
        \`reason\` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '触发原因，当前探索期使用 varchar，稳定后 enum',
        \`occurred_at\` timestamp(3) NULL DEFAULT NULL COMMENT '事件设定时间（系统事件时间）',
        \`dedup_key\` varchar(191) DEFAULT NULL COMMENT '幂等去重键',
        \`status\` enum('queued','processing','succeeded','failed','cancelled') NOT NULL COMMENT '任务状态',
        \`attempt_count\` int unsigned NOT NULL DEFAULT '0' COMMENT '已执行次数',
        \`max_attempts\` int unsigned DEFAULT NULL COMMENT '最大允许执行次数',
        \`enqueued_at\` timestamp(3) NOT NULL COMMENT '入队时间（系统事件时间）',
        \`started_at\` timestamp(3) NULL DEFAULT NULL COMMENT '开始执行时间（系统事件时间）',
        \`finished_at\` timestamp(3) NULL DEFAULT NULL COMMENT '完成时间（系统事件时间）',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_queue_name_job_id\` (\`queue_name\`,\`job_id\`),
        KEY \`idx_trace_id\` (\`trace_id\`),
        KEY \`idx_actor_account_id\` (\`actor_account_id\`),
        KEY \`idx_biz_target\` (\`biz_type\`,\`biz_key\`,\`biz_sub_key\`),
        KEY \`idx_source\` (\`source\`),
        KEY \`idx_reason\` (\`reason\`),
        KEY \`idx_status_enqueued_at\` (\`status\`,\`enqueued_at\`),
        KEY \`idx_dedup_key_status\` (\`dedup_key\`,\`status\`),
        KEY \`idx_occurred_at\` (\`occurred_at\`),
        KEY \`idx_finished_at\` (\`finished_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='异步任务审计记录表';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `base_async_task_record`;');
  }
}
