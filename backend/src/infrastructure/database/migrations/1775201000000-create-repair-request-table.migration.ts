import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRepairRequestTable1775201000000 implements MigrationInterface {
  name = 'CreateRepairRequestTable1775201000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`repair_request\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT '维修申请主键ID',
        \`request_no\` varchar(50) NOT NULL COMMENT '维修申请编号',
        \`customer_account_id\` int NOT NULL COMMENT '提交申请的客户账号ID',
        \`equipment_model_id\` int NOT NULL COMMENT '设备型号ID',
        \`error_code\` varchar(100) NOT NULL COMMENT '设备错误代码',
        \`fault_description\` text NOT NULL COMMENT '客户填写的故障描述',
        \`content_md\` longtext NOT NULL COMMENT '维修申请Markdown内容',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '申请创建时间（系统事件时间）',
        \`is_accepted\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已被工程师接单',
        \`accepted_by_engineer_account_id\` int DEFAULT NULL COMMENT '接单工程师账号ID',
        \`accepted_at\` timestamp(3) NULL DEFAULT NULL COMMENT '接单时间（系统事件时间）',
        \`deprecated\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已撤回/作废',
        \`deleted_at\` timestamp(3) NULL DEFAULT NULL COMMENT '撤回/作废时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_repair_request_no\` (\`request_no\`),
        KEY \`idx_repair_request_customer_created\` (\`customer_account_id\`,\`created_at\`),
        KEY \`idx_repair_request_accepted_created\` (\`is_accepted\`,\`created_at\`),
        KEY \`idx_repair_request_engineer\` (\`accepted_by_engineer_account_id\`),
        KEY \`idx_repair_request_equipment_model\` (\`equipment_model_id\`),
        KEY \`idx_repair_request_created_at\` (\`created_at\`),
        CONSTRAINT \`fk_repair_request_customer_account\` FOREIGN KEY (\`customer_account_id\`) REFERENCES \`base_user_account\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_repair_request_equipment_model\` FOREIGN KEY (\`equipment_model_id\`) REFERENCES \`equipment_model\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_repair_request_engineer_account\` FOREIGN KEY (\`accepted_by_engineer_account_id\`) REFERENCES \`base_user_account\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`chk_repair_request_is_accepted\` CHECK (\`is_accepted\` IN (0, 1)),
        CONSTRAINT \`chk_repair_request_deprecated\` CHECK (\`deprecated\` IN (0, 1)),
        CONSTRAINT \`chk_repair_request_acceptance_consistency\` CHECK (
          (\`is_accepted\` = 0 AND \`accepted_by_engineer_account_id\` IS NULL AND \`accepted_at\` IS NULL)
          OR
          (\`is_accepted\` = 1 AND \`accepted_by_engineer_account_id\` IS NOT NULL AND \`accepted_at\` IS NOT NULL)
        ),
        CONSTRAINT \`chk_repair_request_deletion_consistency\` CHECK (
          (\`deprecated\` = 0 AND \`deleted_at\` IS NULL)
          OR
          (\`deprecated\` = 1 AND \`deleted_at\` IS NOT NULL AND \`is_accepted\` = 0)
        )
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='客户维修申请表';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `repair_request`;');
  }
}
