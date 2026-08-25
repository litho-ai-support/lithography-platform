// src/infrastructure/database/database.module.ts

import { FieldEncryptionModule } from '@src/infrastructure/field-encryption/field-encryption.module';
import { FieldEncryptionSubscriber } from '@src/infrastructure/field-encryption/field-encryption.subscriber';
import { Injectable, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * 数据库配置工厂函数
 * @param config 配置服务实例
 * @returns TypeORM 配置选项
 */
const createDatabaseConfig = (config: ConfigService): TypeOrmModuleOptions => ({
  type: config.get<'mysql'>('mysql.type'),
  host: config.get<string>('mysql.host'),
  port: config.get<number>('mysql.port'),
  username: config.get<string>('mysql.username'),
  password: config.get<string>('mysql.password'),
  database: config.get<string>('mysql.database'),
  timezone: config.get<string>('mysql.timezone'),
  synchronize: config.get<boolean>('mysql.synchronize'),
  logging: config.get<boolean>('mysql.logging'),
  charset: config.get<string>('mysql.charset'),
  extra: config.get('mysql.extra'),
  // 自动加载 entities
  autoLoadEntities: true,
  // 实体文件路径
  // entities: [__dirname + '/**/*.entity{.ts,.js}'],
});

/**
 * 订阅者注入初始化器
 * 避免 TypeORM 直接实例化订阅者导致依赖未注入，确保加密订阅者由 Nest DI 管理
 */
@Injectable()
class DatabaseSubscriberInitializer implements OnModuleInit {
  constructor(
    private readonly dataSource: DataSource,
    private readonly fieldEncryptionSubscriber: FieldEncryptionSubscriber,
  ) {}

  /**
   * 在模块初始化阶段注册加密订阅者实例
   * @returns void
   */
  onModuleInit(): void {
    if (!this.dataSource.subscribers.includes(this.fieldEncryptionSubscriber)) {
      this.dataSource.subscribers.push(this.fieldEncryptionSubscriber);
    }
  }
}

/**
 * 数据库模块
 * 封装 TypeORM 配置和初始化逻辑
 */
@Module({
  imports: [
    FieldEncryptionModule, // 导入加密模块
    TypeOrmModule.forRootAsync({
      imports: [FieldEncryptionModule], // 确保加密模块在此处可用
      inject: [ConfigService],
      useFactory: createDatabaseConfig,
    }),
  ],
  providers: [DatabaseSubscriberInitializer],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
