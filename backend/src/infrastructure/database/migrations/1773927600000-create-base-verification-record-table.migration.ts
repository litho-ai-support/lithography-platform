import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBaseVerificationRecordTable1773927600000 implements MigrationInterface {
  name = 'CreateBaseVerificationRecordTable1773927600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`base_verification_record\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT '验证记录主键 ID',
        \`type\` enum('EMAIL_VERIFY_LINK','EMAIL_VERIFY_CODE','PASSWORD_RESET','SMS_VERIFY_CODE') NOT NULL COMMENT '记录类型：通用验证/一次性动作；细分邮箱链接 vs 验证码',
        \`token_fp\` binary(32) NOT NULL COMMENT '令牌指纹(SHA-256)，不存明文 token',
        \`status\` enum('ACTIVE','CONSUMED','REVOKED','EXPIRED') NOT NULL DEFAULT 'ACTIVE' COMMENT '状态机：一票一次',
        \`expires_at\` datetime NOT NULL COMMENT '过期时间(短TTL)',
        \`not_before\` datetime DEFAULT NULL COMMENT '生效时间(可选)',
        \`target_account_id\` int DEFAULT NULL COMMENT '目标账号(可选；限制记录只能被该账号消费)',
        \`subject_type\` enum('ACCOUNT') DEFAULT NULL COMMENT '主体类型',
        \`subject_id\` int DEFAULT NULL COMMENT '主体 ID',
        \`payload\` json DEFAULT NULL COMMENT '载荷数据(JSON)',
        \`issued_by_account_id\` int DEFAULT NULL COMMENT '签发者账号 ID',
        \`consumed_by_account_id\` int DEFAULT NULL COMMENT '消费者账号 ID',
        \`consumed_at\` timestamp(3) NULL DEFAULT NULL COMMENT '消费时间（系统事件时间）',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_token_fp\` (\`token_fp\`),
        KEY \`idx_type_status_exp\` (\`type\`,\`status\`,\`expires_at\`),
        KEY \`idx_target\` (\`target_account_id\`),
        KEY \`idx_subject\` (\`subject_type\`,\`subject_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='统一验证记录：仅用于跨主体/跨端/可撤销动作';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `base_verification_record`;');
  }
}
