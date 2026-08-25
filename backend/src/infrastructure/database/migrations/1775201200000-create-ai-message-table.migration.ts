import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiMessageTable1775201200000 implements MigrationInterface {
  name = 'CreateAiMessageTable1775201200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`ai_message\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT 'AI消息主键ID',
        \`conversation_id\` int NOT NULL COMMENT 'AI诊断会话ID',
        \`message_seq\` smallint unsigned NOT NULL COMMENT '会话内消息顺序，从1开始',
        \`turn_no\` tinyint unsigned DEFAULT NULL COMMENT '对话轮次，1至100',
        \`role\` enum('SYSTEM','USER','ASSISTANT','TOOL') NOT NULL COMMENT '消息角色',
        \`content_text\` longtext NOT NULL COMMENT '消息正文',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_ai_message_conversation_seq\` (\`conversation_id\`,\`message_seq\`),
        KEY \`idx_ai_message_conversation_turn\` (\`conversation_id\`,\`turn_no\`),
        KEY \`idx_ai_message_conversation_created\` (\`conversation_id\`,\`created_at\`),
        CONSTRAINT \`fk_ai_message_conversation\` FOREIGN KEY (\`conversation_id\`) REFERENCES \`ai_conversation\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`chk_ai_message_seq\` CHECK (\`message_seq\` >= 1),
        CONSTRAINT \`chk_ai_message_turn\` CHECK (\`turn_no\` IS NULL OR \`turn_no\` BETWEEN 1 AND 100),
        CONSTRAINT \`chk_ai_message_role_turn\` CHECK (\`role\` IN ('SYSTEM','TOOL') OR \`turn_no\` IS NOT NULL),
        CONSTRAINT \`chk_ai_message_content\` CHECK (CHAR_LENGTH(TRIM(\`content_text\`)) > 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI故障诊断会话逐轮消息表';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `ai_message`;');
  }
}
