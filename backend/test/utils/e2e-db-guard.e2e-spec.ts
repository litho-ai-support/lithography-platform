// test/utils/e2e-db-guard.e2e-spec.ts

import {
  assertAllowedE2eDatabase,
  assertPhysicalCleanupConsent,
  resolveAllowedE2eDatabases,
} from './e2e-db-guard';

/**
 * PR3 codex review M-02：E2E 目标库白名单守卫回归测试。
 *
 * 这里针对的是「纯校验函数」，不需要真实数据库连接：库名守卫的判定只依赖
 * 实际库名 + E2E_ALLOWED_DB_NAMES 白名单，刻意**不读取**任何跳过开关，
 * 因此可从构造上证明 E2E_SKIP_INFRA_CHECKS / E2E_SKIP_DB_CLEANUP 无法绕过它。
 * 覆盖三条要求的路径：正常允许、E2E_SKIP_DB_CLEANUP、E2E_SKIP_INFRA_CHECKS。
 *
 * 同时覆盖物理删除的第二道独立门禁 assertPhysicalCleanupConsent：只接受显式
 * E2E_ALLOW_PHYSICAL_CLEANUP=1（无默认值），且与库名门禁相互独立、互不替代。
 */
describe('e2e-db-guard (M-02 回归)', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('resolveAllowedE2eDatabases', () => {
    it('默认白名单为 lithography_e2e', () => {
      delete process.env.E2E_ALLOWED_DB_NAMES;
      expect(resolveAllowedE2eDatabases()).toEqual(['lithography_e2e']);
    });

    it('自定义逗号分隔白名单会做 trim + 小写归一', () => {
      process.env.E2E_ALLOWED_DB_NAMES = ' Litho_E2E , other_ci_db ';
      expect(resolveAllowedE2eDatabases()).toEqual(['litho_e2e', 'other_ci_db']);
    });
  });

  describe('assertAllowedE2eDatabase', () => {
    it('正常允许：白名单内的库名通过，且不抛错', () => {
      process.env.E2E_ALLOWED_DB_NAMES = 'lithography_e2e';
      expect(() => assertAllowedE2eDatabase('lithography_e2e')).not.toThrow();
    });

    it('大小写不敏感：任意大小写的白名单库名均通过', () => {
      process.env.E2E_ALLOWED_DB_NAMES = 'lithography_e2e';
      expect(() => assertAllowedE2eDatabase('Lithography_E2E')).not.toThrow();
    });

    it('拒绝：非白名单库（如日常开发库 lithography_drill）抛错', () => {
      process.env.E2E_ALLOWED_DB_NAMES = 'lithography_e2e';
      expect(() => assertAllowedE2eDatabase('lithography_drill')).toThrow(/白名单/);
    });

    it('拒绝：空库名抛错（未成功选库时不得放行）', () => {
      process.env.E2E_ALLOWED_DB_NAMES = 'lithography_e2e';
      expect(() => assertAllowedE2eDatabase('')).toThrow();
    });

    // 关键：证明「跳过开关」无法绕过库名校验（三条路径）。
    it('E2E_SKIP_DB_CLEANUP=true 不能绕过：错库仍抛错', () => {
      process.env.E2E_ALLOWED_DB_NAMES = 'lithography_e2e';
      process.env.E2E_SKIP_DB_CLEANUP = 'true';
      expect(() => assertAllowedE2eDatabase('lithography_drill')).toThrow(/无法绕过/);
    });

    it('E2E_SKIP_INFRA_CHECKS=true 不能绕过：错库仍抛错', () => {
      process.env.E2E_ALLOWED_DB_NAMES = 'lithography_e2e';
      process.env.E2E_SKIP_INFRA_CHECKS = 'true';
      expect(() => assertAllowedE2eDatabase('lithography_drill')).toThrow(/无法绕过/);
    });

    it('即使显式同意清理 E2E_ALLOW_DB_CLEANUP=1，错库仍抛错', () => {
      process.env.E2E_ALLOWED_DB_NAMES = 'lithography_e2e';
      process.env.E2E_ALLOW_DB_CLEANUP = '1';
      expect(() => assertAllowedE2eDatabase('lithography_drill')).toThrow(/白名单/);
    });

    it('正确库在开启各跳过开关时依然放行（开关只影响清理，不影响校验结论）', () => {
      process.env.E2E_ALLOWED_DB_NAMES = 'lithography_e2e';
      process.env.E2E_SKIP_INFRA_CHECKS = 'true';
      process.env.E2E_SKIP_DB_CLEANUP = 'true';
      process.env.E2E_ALLOW_DB_CLEANUP = '1';
      expect(() => assertAllowedE2eDatabase('lithography_e2e')).not.toThrow();
    });
  });

  describe('assertPhysicalCleanupConsent（第二道独立门禁）', () => {
    it('拒绝：未设置 E2E_ALLOW_PHYSICAL_CLEANUP 时失败关闭（无默认值）', () => {
      delete process.env.E2E_ALLOW_PHYSICAL_CLEANUP;
      expect(() => assertPhysicalCleanupConsent()).toThrow(/E2E_ALLOW_PHYSICAL_CLEANUP=1/);
    });

    it('拒绝：仅接受字面量 "1"，其余取值一律失败关闭', () => {
      for (const value of ['true', '0', '', 'yes', '2', 'TRUE', ' 1 ']) {
        process.env.E2E_ALLOW_PHYSICAL_CLEANUP = value;
        expect(() => assertPhysicalCleanupConsent()).toThrow(/E2E_ALLOW_PHYSICAL_CLEANUP=1/);
      }
    });

    it('放行：显式设置 E2E_ALLOW_PHYSICAL_CLEANUP=1 时通过', () => {
      process.env.E2E_ALLOW_PHYSICAL_CLEANUP = '1';
      expect(() => assertPhysicalCleanupConsent()).not.toThrow();
    });

    it('不可替代：E2E_SKIP_DB_CLEANUP / E2E_ALLOW_DB_CLEANUP 均不能充当清理许可', () => {
      delete process.env.E2E_ALLOW_PHYSICAL_CLEANUP;
      process.env.E2E_SKIP_DB_CLEANUP = 'true';
      expect(() => assertPhysicalCleanupConsent()).toThrow(/E2E_ALLOW_PHYSICAL_CLEANUP=1/);
      process.env.E2E_SKIP_DB_CLEANUP = 'false';
      process.env.E2E_ALLOW_DB_CLEANUP = '1';
      expect(() => assertPhysicalCleanupConsent()).toThrow(/E2E_ALLOW_PHYSICAL_CLEANUP=1/);
    });

    it('不可替代：即使清理许可已给，错库仍被白名单门禁拒绝', () => {
      process.env.E2E_ALLOW_PHYSICAL_CLEANUP = '1';
      process.env.E2E_ALLOWED_DB_NAMES = 'lithography_e2e';
      // 两道门禁互相独立：许可通过不代表库名可绕过
      expect(() => assertPhysicalCleanupConsent()).not.toThrow();
      expect(() => assertAllowedE2eDatabase('lithography_drill')).toThrow(/白名单/);
    });
  });
});
