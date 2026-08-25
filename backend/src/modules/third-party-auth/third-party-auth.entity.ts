// src/modules/third-party-auth/third-party-auth.entity.ts
import { ThirdPartyProviderEnum } from '@app-types/models/account.types';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * 第三方登录绑定实体类
 */
@Entity('base_third_party_auth')
@Unique('base_third_party_auth_provider_IDX', ['provider', 'providerUserId'])
@Unique('base_third_party_auth_account_id_IDX', ['accountId', 'provider'])
export class ThirdPartyAuthEntity {
  @PrimaryGeneratedColumn({ type: 'int', comment: '主键' })
  id!: number;

  @Column({ name: 'account_id', type: 'int', comment: '关联账号 base_user_account.id' })
  accountId!: number;

  @Column({
    type: 'enum',
    enum: ThirdPartyProviderEnum,
    comment: '第三方平台类型',
  })
  provider!: ThirdPartyProviderEnum;

  @Column({
    name: 'provider_user_id',
    type: 'varchar',
    length: 128,
    comment: '平台返回的用户唯一标识，如微信 openid、Google sub',
  })
  providerUserId!: string;

  @Column({
    name: 'union_id',
    type: 'varchar',
    length: 128,
    nullable: true,
    comment: '例如微信的 unionid，防御性保留字段',
  })
  unionId!: string | null;

  @Column({
    name: 'access_token',
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: '短期使用的 access_token，仅调试用途',
  })
  accessToken!: string | null;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamp',
    precision: 3,
    default: () => 'CURRENT_TIMESTAMP(3)',
    comment: '创建时间（系统事件时间）',
  })
  createdAt!: Date;

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
