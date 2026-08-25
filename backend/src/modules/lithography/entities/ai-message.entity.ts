import { AiMessageRole } from '../lithography.types';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('ai_message', { comment: 'AI故障诊断会话逐轮消息表' })
@Index('uk_ai_message_conversation_seq', ['conversationId', 'messageSeq'], { unique: true })
@Index('idx_ai_message_conversation_turn', ['conversationId', 'turnNo'])
@Index('idx_ai_message_conversation_created', ['conversationId', 'createdAt'])
@ForeignKey('AiConversationEntity', ['conversationId'], ['id'], {
  name: 'fk_ai_message_conversation',
  onDelete: 'RESTRICT',
  onUpdate: 'RESTRICT',
})
@Check('chk_ai_message_seq', '`message_seq` >= 1')
@Check('chk_ai_message_turn', '(`turn_no` IS NULL OR `turn_no` BETWEEN 1 AND 100)')
@Check('chk_ai_message_role_turn', "(`role` IN ('SYSTEM', 'TOOL') OR `turn_no` IS NOT NULL)")
@Check('chk_ai_message_content', 'CHAR_LENGTH(TRIM(`content_text`)) > 0')
export class AiMessageEntity {
  @PrimaryGeneratedColumn({ type: 'int', comment: 'AI消息主键ID' })
  id!: number;

  @Column({ name: 'conversation_id', type: 'int', comment: 'AI诊断会话ID' })
  conversationId!: number;

  @Column({
    name: 'message_seq',
    type: 'smallint',
    unsigned: true,
    comment: '会话内消息顺序，从1开始',
  })
  messageSeq!: number;

  @Column({
    name: 'turn_no',
    type: 'tinyint',
    unsigned: true,
    nullable: true,
    comment: '对话轮次，1至100',
  })
  turnNo!: number | null;

  @Column({ type: 'enum', enum: AiMessageRole, comment: '消息角色' })
  role!: AiMessageRole;

  @Column({ name: 'content_text', type: 'longtext', comment: '消息正文' })
  contentText!: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    comment: '创建时间（系统事件时间）',
  })
  createdAt!: Date;
}
