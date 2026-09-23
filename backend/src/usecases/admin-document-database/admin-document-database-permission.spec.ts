// src/usecases/admin-document-database/admin-document-database-permission.spec.ts

import { PERMISSION_ERROR, DomainError } from '@core/common/errors/domain-error';
import {
  captureThrownError,
  createSuperAdminSession,
  createUnauthorizedSessions,
} from '../../../test/support/account/admin-user.fixture';
import { assertAdminDocumentDatabasePermission } from './admin-document-database-permission';

/**
 * PR3 S4：管理员文档数据库精确权限断言单测。
 *
 * 失败关闭规则与用户管理断言同源：roles 含 SUPER_ADMIN 且可信 JWT activeRole
 * 精确为 SUPER_ADMIN 才放行；两类「半管理员」矛盾会话（只满足其一）必须拒绝。
 */
describe('assertAdminDocumentDatabasePermission', () => {
  it('SUPER_ADMIN roles + activeRole 精确匹配时放行', () => {
    expect(() =>
      assertAdminDocumentDatabasePermission(createSuperAdminSession(), '查看维修申请数据'),
    ).not.toThrow();
  });

  it.each(createUnauthorizedSessions().map(([label, session]) => ({ label, session })))(
    '$label 时失败关闭拒绝',
    ({ session }) => {
      const thrown = captureThrownError(
        Promise.resolve().then(() =>
          assertAdminDocumentDatabasePermission(session, '查看维修申请数据'),
        ),
      ) as unknown as Promise<DomainError>;

      return thrown.then((error) => {
        expect(error).toBeInstanceOf(DomainError);
        expect(error.code).toBe(PERMISSION_ERROR.INSUFFICIENT_PERMISSIONS);
        expect(error.message).toContain('仅超级管理员可以查看维修申请数据');
      });
    },
  );

  it('拒绝 details 不携带任何身份事实', async () => {
    const [engineerSession] = createUnauthorizedSessions();
    const thrown = (await captureThrownError(
      Promise.resolve().then(() =>
        assertAdminDocumentDatabasePermission(engineerSession[1], '查看文档数据库统计'),
      ),
    )) as DomainError;

    expect(thrown.details).toBeUndefined();
  });
});
