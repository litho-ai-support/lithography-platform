import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBaseThirdPartyAuthTable1773926400000 implements MigrationInterface {
  name = 'CreateBaseThirdPartyAuthTable1773926400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`base_third_party_auth\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT '主键',
        \`account_id\` int NOT NULL COMMENT '关联账号 base_user_account.id',
        \`provider\` enum('WECHAT','QQ','GOOGLE','GITHUB','WEAPP') CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL COMMENT '第三方平台类型',
        \`provider_user_id\` varchar(128) NOT NULL COMMENT '平台返回的用户唯一标识，如微信 openid、Google sub',
        \`union_id\` varchar(128) DEFAULT NULL COMMENT '例如微信的 unionid，防御性保留字段',
        \`access_token\` varchar(255) DEFAULT NULL COMMENT '短期使用的 access_token，仅调试用途',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`base_third_party_auth_provider_IDX\` (\`provider\`,\`provider_user_id\`) USING BTREE,
        UNIQUE KEY \`base_third_party_auth_account_id_IDX\` (\`account_id\`,\`provider\`) USING BTREE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='第三方登录绑定表';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `base_third_party_auth`;');
  }
}
