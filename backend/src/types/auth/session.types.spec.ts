// src/types/auth/session.types.spec.ts

import { IdentityTypeEnum } from '../models/account.types';
import type { JwtPayload } from '../jwt.types';
import { mapJwtToUsecaseSession } from './session.types';

/**
 * Session 映射单测：唯一 JWT → UsecaseSession 入口的映射契约
 * （activeRole 透传、缺失不伪造、roles 规范化行为不回归）
 */
describe('mapJwtToUsecaseSession', () => {
  const basePayload: JwtPayload = {
    sub: 7,
    username: '测试工程师',
    email: 'engineer@example.com',
    accessGroup: ['engineer'],
    type: 'access',
  };

  it('JWT activeRole=ENGINEER 时正确进入 UsecaseSession', () => {
    const session = mapJwtToUsecaseSession({
      ...basePayload,
      accessGroup: [IdentityTypeEnum.ENGINEER],
      activeRole: IdentityTypeEnum.ENGINEER,
    });

    expect(session).toMatchObject({
      accountId: 7,
      roles: ['ENGINEER'],
      activeRole: IdentityTypeEnum.ENGINEER,
    });
  });

  it('activeRole 缺失时保持缺失，不会被伪造为 ENGINEER 或其他角色', () => {
    const session = mapJwtToUsecaseSession(basePayload);

    expect(session.activeRole).toBeUndefined();
    expect(session.activeRole).not.toBe(IdentityTypeEnum.ENGINEER);
  });

  it('accessGroup 规范化行为不回归：大写归一、去空值与去重', () => {
    const session = mapJwtToUsecaseSession({
      ...basePayload,
      accessGroup: [' engineer ', 'CUSTOMER', 'engineer', '', null as unknown as string],
    });

    expect(session.roles).toEqual(['ENGINEER', 'CUSTOMER']);
  });
});
