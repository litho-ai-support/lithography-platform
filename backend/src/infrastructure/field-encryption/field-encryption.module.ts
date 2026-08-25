// src/infrastructure/field-encryption/field-encryption.module.ts
import { Module } from '@nestjs/common';
import { FieldEncryptionService } from './field-encryption.service';
import { FieldEncryptionSubscriber } from './field-encryption.subscriber';

@Module({
  providers: [FieldEncryptionService, FieldEncryptionSubscriber],
  exports: [FieldEncryptionService, FieldEncryptionSubscriber],
})
export class FieldEncryptionModule {}
