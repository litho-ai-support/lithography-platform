import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEngineerResponseTable1775201400000 implements MigrationInterface {
  name = 'CreateEngineerResponseTable1775201400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`engineer_response\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT '工程师回复主键ID',
        \`request_id\` int NOT NULL COMMENT '维修申请ID',
        \`engineer_account_id\` int NOT NULL COMMENT '回复工程师账号ID',
        \`customer_account_id\` int NOT NULL COMMENT '接收回复的客户账号ID',
        \`resolution_status\` enum('PENDING','RESOLVED') NOT NULL DEFAULT 'PENDING' COMMENT '处理状态',
        \`response_text\` text NOT NULL COMMENT '面向客户的处理回复',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        KEY \`idx_engineer_response_request_created\` (\`request_id\`,\`created_at\`),
        KEY \`idx_engineer_response_engineer_created\` (\`engineer_account_id\`,\`created_at\`),
        KEY \`idx_engineer_response_customer_created\` (\`customer_account_id\`,\`created_at\`),
        CONSTRAINT \`fk_engineer_response_request\` FOREIGN KEY (\`request_id\`) REFERENCES \`repair_request\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_engineer_response_engineer_account\` FOREIGN KEY (\`engineer_account_id\`) REFERENCES \`base_user_account\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_engineer_response_customer_account\` FOREIGN KEY (\`customer_account_id\`) REFERENCES \`base_user_account\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`chk_engineer_response_text\` CHECK (CHAR_LENGTH(TRIM(\`response_text\`)) > 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='工程师面向客户的处理回复表';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `engineer_response`;');
  }
}
