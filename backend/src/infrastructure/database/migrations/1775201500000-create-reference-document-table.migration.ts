import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReferenceDocumentTable1775201500000 implements MigrationInterface {
  name = 'CreateReferenceDocumentTable1775201500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`reference_document\` (
        \`id\` int NOT NULL AUTO_INCREMENT COMMENT '参考文档主键ID',
        \`title\` varchar(255) NOT NULL COMMENT '文档标题',
        \`document_type\` varchar(100) NOT NULL COMMENT '文档类型',
        \`equipment_model_id\` int DEFAULT NULL COMMENT '适用设备型号ID；为空表示通用资料',
        \`description\` text DEFAULT NULL COMMENT '文档说明',
        \`original_filename\` varchar(255) DEFAULT NULL COMMENT '原始文件名',
        \`mime_type\` varchar(127) DEFAULT NULL COMMENT '文件MIME类型',
        \`content_text\` longtext DEFAULT NULL COMMENT '从文档提取的可搜索文本',
        \`storage_backend\` varchar(32) DEFAULT NULL COMMENT '外部存储类型',
        \`storage_reference\` varchar(512) DEFAULT NULL COMMENT '外部存储引用',
        \`created_by_account_id\` int NOT NULL COMMENT '创建人账号ID',
        \`deprecated\` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已软删除',
        \`deleted_at\` timestamp(3) NULL DEFAULT NULL COMMENT '软删除时间',
        \`created_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间（系统事件时间）',
        \`updated_at\` timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间（系统事件时间）',
        PRIMARY KEY (\`id\`),
        KEY \`idx_reference_document_model_type\` (\`equipment_model_id\`,\`document_type\`),
        KEY \`idx_reference_document_creator_created\` (\`created_by_account_id\`,\`created_at\`),
        KEY \`idx_reference_document_storage\` (\`storage_backend\`,\`storage_reference\`),
        KEY \`idx_reference_document_deprecated_created\` (\`deprecated\`,\`created_at\`),
        CONSTRAINT \`fk_reference_document_equipment_model\` FOREIGN KEY (\`equipment_model_id\`) REFERENCES \`equipment_model\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`fk_reference_document_created_by_account\` FOREIGN KEY (\`created_by_account_id\`) REFERENCES \`base_user_account\` (\`id\`) ON DELETE RESTRICT ON UPDATE RESTRICT,
        CONSTRAINT \`chk_reference_document_deprecated\` CHECK (\`deprecated\` IN (0, 1)),
        CONSTRAINT \`chk_reference_document_deletion_consistency\` CHECK (
          (\`deprecated\` = 0 AND \`deleted_at\` IS NULL)
          OR
          (\`deprecated\` = 1 AND \`deleted_at\` IS NOT NULL)
        ),
        CONSTRAINT \`chk_reference_document_storage_pair\` CHECK (
          (\`storage_backend\` IS NULL AND \`storage_reference\` IS NULL)
          OR
          (\`storage_backend\` IS NOT NULL AND \`storage_reference\` IS NOT NULL)
        ),
        CONSTRAINT \`chk_reference_document_content_source\` CHECK (
          \`content_text\` IS NOT NULL OR \`storage_reference\` IS NOT NULL
        )
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='光刻机AI参考资料元数据表';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `reference_document`;');
  }
}
