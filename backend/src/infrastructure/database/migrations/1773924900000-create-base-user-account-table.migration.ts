import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBaseUserAccountTable1773924900000 implements MigrationInterface {
  name = 'CreateBaseUserAccountTable1773924900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`base_user_account\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT 'primary key',
        \`login_name\` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '账号名',
        \`login_email\` varchar(100) DEFAULT NULL COMMENT '账号email',
        \`login_password\` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '密码',
        \`status\` enum('ACTIVE','BANNED','DELETED','PENDING','SUSPENDED','INACTIVE') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL DEFAULT 'PENDING' COMMENT '"ACTIVE=1"、"BANNED=2"、"DELETED=3"、"PENDING=4"、"SUSPENDED=5"、"INACTIVE=6"',
        \`recent_login_history\` json DEFAULT NULL COMMENT '最近5次登录IP',
        \`identity_hint\` varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '身份提示字段，用于加速判断当前账号角色：如 "ADMIN","STAFF","GUEST","REGISTRANT"',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_login_name\` (\`login_name\`),
        UNIQUE KEY \`uk_login_email\` (\`login_email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='user';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `base_user_account`;');
  }
}
