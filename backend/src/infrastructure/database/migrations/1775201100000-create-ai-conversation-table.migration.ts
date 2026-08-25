import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiConversationTable1775201100000 implements MigrationInterface {
  name = 'CreateAiConversationTable1775201100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`ai_conversation\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT 'AI诊断会话主键ID',
        \`request_id\` int NOT NULL COMMENT '维修申请ID',
        \`engineer_account_id\` int NOT NULL COMMENT '发起会话的工程师账号ID',
        \`status\` enum('ACTIVE','COMPLETED') NOT NULL DEFAULT 'ACTIVE' COMMENT '会话状态',
        \`ai_feedback\` text DEFAULT NULL COMMENT '会话完成时填写的工程师反馈和实际维修过程',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        \`completed_at\` timestamp(3) NULL DEFAULT NULL COMMENT '会话完成时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        KEY \`idx_ai_conversation_request_created\` (\`request_id\`,\`created_at\`),
        KEY \`idx_ai_conversation_engineer_created\` (\`engineer_account_id\`,\`created_at\`),
        KEY \`idx_ai_conversation_status_created\` (\`status\`,\`created_at\`),
        CONSTRAINT \`fk_ai_conversation_request\` FOREIGN KEY (\`request_id\`) REFERENCES \`repair_request\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_ai_conversation_engineer_account\` FOREIGN KEY (\`engineer_account_id\`) REFERENCES \`base_user_account\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`chk_ai_conversation_completion\` CHECK (
          (\`status\` = 'ACTIVE' AND \`completed_at\` IS NULL)
          OR
          (\`status\` = 'COMPLETED' AND \`ai_feedback\` IS NOT NULL AND CHAR_LENGTH(TRIM(\`ai_feedback\`)) > 0 AND \`completed_at\` IS NOT NULL)
        )
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='维修申请AI故障诊断会话表';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `ai_conversation`;');
  }
}
