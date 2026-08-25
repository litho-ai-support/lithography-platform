import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEquipmentModelTable1775200900000 implements MigrationInterface {
  name = 'CreateEquipmentModelTable1775200900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`equipment_model\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT '设备型号主键ID',
        \`model_code\` varchar(50) NOT NULL COMMENT '设备型号编码',
        \`model_name\` varchar(100) NOT NULL COMMENT '设备型号显示名称',
        \`sort_order\` int unsigned NOT NULL DEFAULT '0' COMMENT '显示排序值',
        \`enabled\` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用：0=停用，1=启用',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uk_equipment_model_code\` (\`model_code\`),
        KEY \`idx_equipment_model_enabled_sort\` (\`enabled\`,\`sort_order\`),
        CONSTRAINT \`chk_equipment_model_enabled\` CHECK (\`enabled\` IN (0, 1))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='光刻机设备型号表';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `equipment_model`;');
  }
}
