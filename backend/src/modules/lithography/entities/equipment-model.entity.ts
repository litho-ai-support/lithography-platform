import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('equipment_model', { comment: '光刻机设备型号表' })
@Index('uk_equipment_model_code', ['modelCode'], { unique: true })
@Index('idx_equipment_model_enabled_sort', ['enabled', 'sortOrder'])
@Check('chk_equipment_model_enabled', '`enabled` IN (0, 1)')
export class EquipmentModelEntity {
  @PrimaryGeneratedColumn({ type: 'int', comment: '设备型号主键ID' })
  id!: number;

  @Column({ name: 'model_code', type: 'varchar', length: 50, comment: '设备型号编码' })
  modelCode!: string;

  @Column({ name: 'model_name', type: 'varchar', length: 100, comment: '设备型号显示名称' })
  modelName!: string;

  @Column({ name: 'sort_order', type: 'int', unsigned: true, default: 0, comment: '显示排序值' })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true, comment: '是否启用：0=停用，1=启用' })
  enabled!: boolean;

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
