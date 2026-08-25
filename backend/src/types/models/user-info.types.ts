// src/types/models/user-info.types.ts
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  SECRET = 'SECRET',
}

export enum UserState {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING = 'PENDING',
}

export interface GeographicInfo {
  province?: string;
  city?: string;
}
