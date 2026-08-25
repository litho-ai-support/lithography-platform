import {
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ai_report', { comment: 'AI故障诊断报告表' })
@Index('uk_ai_report_conversation_type', ['conversationId', 'reportType'], { unique: true })
@Index('idx_ai_report_request_created', ['requestId', 'createdAt'])
@Index('idx_ai_report_conversation', ['conversationId'])
@Index('idx_ai_report_engineer_created', ['engineerAccountId', 'createdAt'])
@ForeignKey('RepairRequestEntity', ['requestId'], ['id'], {
  name: 'fk_ai_report_request',
  onDelete: 'RESTRICT',
  onUpdate: 'RESTRICT',
})
@ForeignKey('AiConversationEntity', ['conversationId'], ['id'], {
  name: 'fk_ai_report_conversation',
  onDelete: 'RESTRICT',
  onUpdate: 'RESTRICT',
})
@ForeignKey('AccountEntity', ['engineerAccountId'], ['id'], {
  name: 'fk_ai_report_engineer_account',
  onDelete: 'RESTRICT',
  onUpdate: 'RESTRICT',
})
export class AiReportEntity {
  @PrimaryGeneratedColumn({ type: 'int', comment: 'AI报告主键ID' })
  id!: number;

  @Column({ name: 'request_id', type: 'int', comment: '维修申请ID' })
  requestId!: number;

  @Column({ name: 'conversation_id', type: 'int', comment: '生成报告所依据的AI会话ID' })
  conversationId!: number;

  @Column({ name: 'engineer_account_id', type: 'int', comment: '生成报告的工程师账号ID' })
  engineerAccountId!: number;

  @Column({ name: 'report_title', type: 'varchar', length: 200, comment: '报告标题' })
  reportTitle!: string;

  @Column({ name: 'report_type', type: 'varchar', length: 50, comment: '报告类型' })
  reportType!: string;

  @Column({ name: 'content_md', type: 'longtext', comment: '报告Markdown内容' })
  contentMd!: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    comment: '创建时间（系统事件时间）',
  })
  createdAt!: Date;
}
