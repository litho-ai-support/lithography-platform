// src/modules/verification-record/verification-record.entity.ts

import {
  SubjectType,
  VerificationRecordStatus,
  VerificationRecordType,
} from '@app-types/models/verification-record.types';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 统一验证记录实体
 * 对应数据库表：base_verification_record
 * 仅用于跨主体/跨端/可撤销动作
 */
@Entity('base_verification_record')
@Index('uk_token_fp', ['tokenFp'], { unique: true })
@Index('idx_type_status_exp', ['type', 'status', 'expiresAt'])
@Index('idx_target', ['targetAccountId'])
@Index('idx_subject', ['subjectType', 'subjectId'])
export class VerificationRecordEntity {
  /**
   * 验证记录 ID，主键
   * 自增整型主键
   */
  @PrimaryGeneratedColumn({ type: 'int', comment: '验证记录主键 ID' })
  id!: number;

  /**
   * 记录类型
   * 枚举类型：通用验证/一次性动作；细分邮箱链接 vs 验证码
   */
  @Column({
    type: 'enum',
    enum: VerificationRecordType,
    nullable: false,
    comment: '记录类型：通用验证/一次性动作；细分邮箱链接 vs 验证码',
  })
  type!: VerificationRecordType;

  /**
   * 令牌指纹
   * SHA-256 哈希值，不存储明文 token
   * 具有唯一约束 uk_token_fp
   */
  @Column({
    name: 'token_fp',
    type: 'binary',
    length: 32,
    nullable: false,
    comment: '令牌指纹(SHA-256)，不存明文 token',
  })
  tokenFp!: Buffer;

  /**
   * 记录状态
   * 枚举类型：ACTIVE/CONSUMED/REVOKED/EXPIRED
   * 状态机：一票一次，默认为 ACTIVE
   */
  @Column({
    type: 'enum',
    enum: VerificationRecordStatus,
    nullable: false,
    default: VerificationRecordStatus.ACTIVE,
    comment: '状态机：一票一次',
  })
  status!: VerificationRecordStatus;

  /**
   * 过期时间
   * 必填字段，短 TTL 设计
   */
  @Column({
    name: 'expires_at',
    type: 'datetime',
    nullable: false,
    comment: '过期时间(短TTL)',
  })
  expiresAt!: Date;

  /**
   * 生效时间
   * 可为空，用于延迟生效的场景
   */
  @Column({
    name: 'not_before',
    type: 'datetime',
    nullable: true,
    comment: '生效时间(可选)',
  })
  notBefore!: Date | null;

  /**
   * 目标账号 ID
   * 可为空，限制记录只能被该账号消费
   */
  @Column({
    name: 'target_account_id',
    type: 'int',
    nullable: true,
    comment: '目标账号(可选；限制记录只能被该账号消费)',
  })
  targetAccountId!: number | null;

  /**
   * 主体类型
   * 枚举类型：ACCOUNT
   * 可为空，用于标识验证记录关联的主体类型
   */
  @Column({
    name: 'subject_type',
    type: 'enum',
    enum: SubjectType,
    nullable: true,
    comment: '主体类型',
  })
  subjectType!: SubjectType | null;

  /**
   * 主体 ID
   * 可为空，配合 subject_type 使用，标识具体的主体实例
   */
  @Column({
    name: 'subject_id',
    type: 'int',
    nullable: true,
    comment: '主体 ID',
  })
  subjectId!: number | null;

  /**
   * 载荷数据
   * JSON 格式，可为空，存储验证记录的附加信息
   */
  @Column({
    type: 'json',
    nullable: true,
    comment: '载荷数据(JSON)',
  })
  payload!: Record<string, unknown> | null;

  /**
   * 签发者账号 ID
   * 可为空，记录创建该验证记录的账号 ID
   */
  @Column({
    name: 'issued_by_account_id',
    type: 'int',
    nullable: true,
    comment: '签发者账号 ID',
  })
  issuedByAccountId!: number | null;

  /**
   * 消费者账号 ID
   * 可为空，记录消费该验证记录的账号 ID
   */
  @Column({
    name: 'consumed_by_account_id',
    type: 'int',
    nullable: true,
    comment: '消费者账号 ID',
  })
  consumedByAccountId!: number | null;

  /**
   * 消费时间
   * 可为空，记录验证记录被消费的时间
   */
  @Column({
    name: 'consumed_at',
    type: 'timestamp',
    precision: 3,
    nullable: true,
    comment: '消费时间（系统事件时间）',
  })
  consumedAt!: Date | null;

  /**
   * 创建时间
   * 自动设置为当前时间戳
   */
  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    comment: '创建时间（系统事件时间）',
  })
  createdAt!: Date;

  /**
   * 更新时间
   * 自动更新为当前时间戳
   */
  @UpdateDateColumn({
    name: 'updated_at',
    type: 'timestamp',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    onUpdate: 'CURRENT_TIMESTAMP(3)',
    comment: '更新时间（系统事件时间）',
  })
  updatedAt!: Date;
}
