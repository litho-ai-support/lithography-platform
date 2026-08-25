import { EngineerResolutionStatus } from '../lithography.types';
import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  ForeignKey,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('engineer_response', { comment: '工程师面向客户的处理回复表' })
@Index('idx_engineer_response_request_created', ['requestId', 'createdAt'])
@Index('idx_engineer_response_engineer_created', ['engineerAccountId', 'createdAt'])
@Index('idx_engineer_response_customer_created', ['customerAccountId', 'createdAt'])
@ForeignKey('RepairRequestEntity', ['requestId'], ['id'], {
  name: 'fk_engineer_response_request',
  onDelete: 'RESTRICT',
  onUpdate: 'RESTRICT',
})
@ForeignKey('AccountEntity', ['engineerAccountId'], ['id'], {
  name: 'fk_engineer_response_engineer_account',
  onDelete: 'RESTRICT',
  onUpdate: 'RESTRICT',
})
@ForeignKey('AccountEntity', ['customerAccountId'], ['id'], {
  name: 'fk_engineer_response_customer_account',
  onDelete: 'RESTRICT',
  onUpdate: 'RESTRICT',
})
@Check('chk_engineer_response_text', 'CHAR_LENGTH(TRIM(`response_text`)) > 0')
export class EngineerResponseEntity {
  @PrimaryGeneratedColumn({ type: 'int', comment: '工程师回复主键ID' })
  id!: number;

  @Column({ name: 'request_id', type: 'int', comment: '维修申请ID' })
  requestId!: number;

  @Column({ name: 'engineer_account_id', type: 'int', comment: '回复工程师账号ID' })
  engineerAccountId!: number;

  @Column({ name: 'customer_account_id', type: 'int', comment: '接收回复的客户账号ID' })
  customerAccountId!: number;

  @Column({
    name: 'resolution_status',
    type: 'enum',
    enum: EngineerResolutionStatus,
    default: EngineerResolutionStatus.PENDING,
    comment: '处理状态',
  })
  resolutionStatus!: EngineerResolutionStatus;

  @Column({ name: 'response_text', type: 'text', comment: '面向客户的处理回复' })
  responseText!: string;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    comment: '创建时间（系统事件时间）',
  })
  createdAt!: Date;
}
