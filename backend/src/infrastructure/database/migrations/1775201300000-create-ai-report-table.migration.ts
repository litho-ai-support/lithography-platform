import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAiReportTable1775201300000 implements MigrationInterface {
  name = 'CreateAiReportTable1775201300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`ai_report\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT 'AI报告主键ID',
        \`request_id\` int NOT NULL COMMENT '维修申请ID',
        \`conversation_id\` int NOT NULL COMMENT '生成报告所依据的AI会话ID',
        \`engineer_account_id\` int NOT NULL COMMENT '生成报告的工程师账号ID',
        \`report_title\` varchar(200) NOT NULL COMMENT '报告标题',
        \`report_type\` varchar(50) NOT NULL COMMENT '报告类型',
        \`content_md\` longtext NOT NULL COMMENT '报告Markdown内容',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_ai_report_conversation_type\` (\`conversation_id\`,\`report_type\`),
        KEY \`idx_ai_report_request_created\` (\`request_id\`,\`created_at\`),
        KEY \`idx_ai_report_conversation\` (\`conversation_id\`),
        KEY \`idx_ai_report_engineer_created\` (\`engineer_account_id\`,\`created_at\`),
        CONSTRAINT \`fk_ai_report_request\` FOREIGN KEY (\`request_id\`) REFERENCES \`repair_request\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_ai_report_conversation\` FOREIGN KEY (\`conversation_id\`) REFERENCES \`ai_conversation\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_ai_report_engineer_account\` FOREIGN KEY (\`engineer_account_id\`) REFERENCES \`base_user_account\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='AI故障诊断报告表';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `ai_report`;');
  }
}
