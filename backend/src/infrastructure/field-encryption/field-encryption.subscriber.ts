// src/infrastructure/field-encryption/field-encryption.subscriber.ts
import { Injectable } from '@nestjs/common';
import { EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from 'typeorm';
import { FieldEncryptionService } from './field-encryption.service';

@Injectable()
@EventSubscriber()
export class FieldEncryptionSubscriber implements EntitySubscriberInterface<unknown> {
  constructor(private readonly crypto: FieldEncryptionService) {}

  beforeInsert(event: InsertEvent<unknown>): void {
    if (event.entity) this.crypto.encryptEntity(event.entity);
  }

  beforeUpdate(event: UpdateEvent<unknown>): void {
    if (event.entity) this.crypto.encryptEntity(event.entity);
  }

  afterLoad(entity: unknown): void {
    this.crypto.decryptEntity(entity);
  }
}
