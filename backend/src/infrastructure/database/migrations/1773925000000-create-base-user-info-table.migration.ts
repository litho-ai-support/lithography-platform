import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBaseUserInfoTable1773925000000 implements MigrationInterface {
  name = 'CreateBaseUserInfoTable1773925000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`base_user_info\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT '主键',
        \`account_id\` int NOT NULL COMMENT 'base_user_account.id',
        \`nickname\` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '昵称',
        \`gender\` enum('MALE','FEMALE','SECRET') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'SECRET' COMMENT '性别',
        \`birth_date\` date DEFAULT NULL COMMENT '出生日期，仅保留年月日',
        \`avatar_url\` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '头像',
        \`email\` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '邮箱',
        \`signature\` varchar(100) DEFAULT NULL COMMENT '个性签名',
        \`access_group\` json NOT NULL COMMENT '用户分组 ["guest"]',
        \`address\` varchar(255) DEFAULT NULL COMMENT '地址',
        \`phone\` varchar(20) DEFAULT NULL COMMENT '电话',
        \`tags\` json DEFAULT NULL COMMENT '标签',
        \`geographic\` json DEFAULT NULL COMMENT '地理位置',
        \`meta_digest\` varchar(1024) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT NULL COMMENT '私有数据加密字段',
        \`notify_count\` int DEFAULT '0' COMMENT '通知数',
        \`unread_count\` int DEFAULT '0' COMMENT '未读通知数',
        \`user_state\` enum('ACTIVE','INACTIVE','SUSPENDED','PENDING') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci DEFAULT 'PENDING' COMMENT '账户统一状态：ACTIVE=可用，INACTIVE=停用，SUSPENDED=暂停，PENDING=待完善',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_account_id\` (\`account_id\`),
        KEY \`account_id\` (\`account_id\`),
        CONSTRAINT \`base_user_info_ibfk_1\` FOREIGN KEY (\`account_id\`) REFERENCES \`base_user_account\` (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户基本信息表';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `base_user_info`;');
  }
}
