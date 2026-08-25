// src/infrastructure/field-encryption/field-encryption.metadata.ts
import 'reflect-metadata';

export const ENCRYPTED_FIELDS_METADATA_KEY = 'core:encrypted_fields';

export const registerEncryptedField = (target: object, propertyKey: string | symbol): void => {
  const existing = getEncryptedFields(target);
  Reflect.defineMetadata(
    ENCRYPTED_FIELDS_METADATA_KEY,
    [...new Set([...existing, propertyKey])],
    target,
  );
};

export const getEncryptedFields = (target: object): readonly (string | symbol)[] => {
  return (Reflect.getMetadata(ENCRYPTED_FIELDS_METADATA_KEY, target) ?? []) as readonly (
    string | symbol
  )[];
};
