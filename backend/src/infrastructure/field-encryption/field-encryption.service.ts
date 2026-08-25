// src/infrastructure/field-encryption/field-encryption.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';
import { getEncryptedFields } from './field-encryption.metadata';

const getRequiredConfig = (config: ConfigService, key: string): string => {
  const value = config.get<string>(key);
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
};

const FIELD_ENCRYPTION_META = {
  KEY_LENGTH: 16,
  IV_LENGTH: 16,
} as const;

@Injectable()
export class FieldEncryptionService {
  private readonly key: CryptoJS.lib.WordArray;
  private readonly iv: CryptoJS.lib.WordArray;

  constructor(private readonly configService: ConfigService) {
    const key = getRequiredConfig(this.configService, 'FIELD_ENCRYPTION_KEY');
    const iv = getRequiredConfig(this.configService, 'FIELD_ENCRYPTION_IV');

    this.key = CryptoJS.lib.WordArray.create(
      CryptoJS.enc.Utf8.parse(key).words,
      FIELD_ENCRYPTION_META.KEY_LENGTH,
    );
    this.iv = CryptoJS.lib.WordArray.create(
      CryptoJS.enc.Utf8.parse(iv).words,
      FIELD_ENCRYPTION_META.IV_LENGTH,
    );
  }

  encrypt(plain: string): string {
    return CryptoJS.AES.encrypt(plain, this.key, {
      iv: this.iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).toString();
  }

  decrypt(cipher: string): string {
    return CryptoJS.AES.decrypt(cipher, this.key, {
      iv: this.iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    }).toString(CryptoJS.enc.Utf8);
  }

  encryptEntity(entity: unknown) {
    if (typeof entity !== 'object' || entity === null) return;
    const fields = getEncryptedFields(entity.constructor);
    for (const field of fields) {
      const val = (entity as Record<string | symbol, unknown>)[field];

      if (typeof val === 'string' && val) {
        const encrypted = this.encrypt(val);
        (entity as Record<string | symbol, unknown>)[field] = encrypted;
      } else if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
        const jsonString = JSON.stringify(val);
        const encrypted = this.encrypt(jsonString);
        (entity as Record<string | symbol, unknown>)[field] = encrypted;
      }
    }
  }

  decryptEntity(entity: unknown) {
    if (typeof entity !== 'object' || entity === null) return;
    const fields = getEncryptedFields(entity.constructor);
    for (const field of fields) {
      const val = (entity as Record<string | symbol, unknown>)[field];

      if (typeof val === 'string' && val) {
        try {
          const decrypted = this.decrypt(val);
          try {
            const parsed: unknown = JSON.parse(decrypted);

            (entity as Record<string | symbol, unknown>)[field] = parsed;
          } catch {
            (entity as Record<string | symbol, unknown>)[field] = decrypted;
          }
        } catch {
          continue;
        }
      }
    }
  }
}
