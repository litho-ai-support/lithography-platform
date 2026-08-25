// src/infrastructure/config/jwt.config.ts

import { registerAs } from '@nestjs/config';

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value || value.trim().length === 0) {
    throw new Error(`${key} is required`);
  }
  return value;
};

export default registerAs('jwt', () => ({
  // 用于签名 JWT 的密钥（建议走环境变量管理）
  secret: getRequiredEnv('JWT_SECRET'),

  // Access Token 有效期
  expiresIn: process.env.JWT_EXPIRES_IN || '2h',

  // Refresh Token 有效期（如果实现刷新机制）
  refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',

  // 是否启用 JWT 的加密算法和算法选项（可选）
  algorithm: process.env.JWT_ALGORITHM || 'HS256',

  // 是否允许自动刷新（自定义业务用）
  enableRefresh: process.env.JWT_ENABLE_REFRESH === 'true',

  // 允许的 issuer、audience 等（更严格控制）
  issuer: process.env.JWT_ISSUER || 'ssts-local',
  audience: process.env.JWT_AUDIENCE || 'DESKTOP,SSTSTEST,SSTSWEB,SSTSWEAPP,SJWEB,SJWEAPP',
}));
