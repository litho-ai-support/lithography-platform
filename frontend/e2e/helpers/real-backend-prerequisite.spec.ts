// e2e/helpers/real-backend-prerequisite.spec.ts
// @vitest-environment node
// 真实后端预检共享策略的单测（失败关闭修复轮 P3）：纯判定函数，不发起真实网络或数据库访问。
//
// 关键断言：
// - 普通模式：三类前提缺失各自返回对应跳过原因，全部就绪返回 null（保持既有 skip 语义）；
// - 严格模式：同一批前提缺失一律抛错，绝不返回跳过原因（专用入口不得以 skipped 掩盖）；
// - 判定优先级与既有 beforeEach 一致：env 文件 → 前端通道 → 后端探针；
// - requireFrontendChannel=false 时忽略前端通道维度（纯后端契约用例）；
// - 严格模式开关只认 DEDICATED_E2E_STRICT_MODE_ENV === '1'。

import { afterEach, describe, expect, it } from 'vitest';

import { DEDICATED_E2E_STRICT_MODE_ENV } from '../../e2e-real/dedicated-e2e-environment';

import {
  decideRealBackendPrerequisite,
  isRealBackendStrictMode,
  type RealBackendPrerequisiteState,
} from './real-backend';

const READY: RealBackendPrerequisiteState = {
  backendAvailable: true,
  envAvailable: true,
  frontendChannelAvailable: true,
};

describe('isRealBackendStrictMode', () => {
  const original = process.env[DEDICATED_E2E_STRICT_MODE_ENV];

  afterEach(() => {
    if (original === undefined) {
      delete process.env[DEDICATED_E2E_STRICT_MODE_ENV];
    } else {
      process.env[DEDICATED_E2E_STRICT_MODE_ENV] = original;
    }
  });

  it('默认关闭，且只认 "1"', () => {
    delete process.env[DEDICATED_E2E_STRICT_MODE_ENV];
    expect(isRealBackendStrictMode()).toBe(false);

    process.env[DEDICATED_E2E_STRICT_MODE_ENV] = '0';
    expect(isRealBackendStrictMode()).toBe(false);

    process.env[DEDICATED_E2E_STRICT_MODE_ENV] = '1';
    expect(isRealBackendStrictMode()).toBe(true);
  });
});

describe('decideRealBackendPrerequisite - 普通模式保持 skip 判定', () => {
  it('全部就绪返回 null', () => {
    expect(decideRealBackendPrerequisite(READY, { strict: false })).toBeNull();
  });

  it('env 文件缺失返回跳过原因', () => {
    const reason = decideRealBackendPrerequisite(
      { ...READY, envAvailable: false },
      { strict: false },
    );

    expect(reason).toContain('backend/env/.env.development 缺失');
  });

  it('前端真实通道不可达返回跳过原因', () => {
    const reason = decideRealBackendPrerequisite(
      { ...READY, frontendChannelAvailable: false },
      { strict: false },
    );

    expect(reason).toContain('前端真实通道不可达');
  });

  it('后端不可用或不可登录返回跳过原因', () => {
    const reason = decideRealBackendPrerequisite(
      { ...READY, backendAvailable: false },
      { strict: false },
    );

    expect(reason).toContain('本地后端不可用或不可登录');
  });

  it('requireFrontendChannel=false 时忽略前端通道维度', () => {
    expect(
      decideRealBackendPrerequisite(
        { ...READY, frontendChannelAvailable: false },
        { requireFrontendChannel: false, strict: false },
      ),
    ).toBeNull();
  });

  it('判定优先级：env 缺失优先于通道与后端', () => {
    const reason = decideRealBackendPrerequisite(
      { backendAvailable: false, envAvailable: false, frontendChannelAvailable: false },
      { strict: false },
    );

    expect(reason).toContain('backend/env/.env.development 缺失');
  });
});

describe('decideRealBackendPrerequisite - 严格模式失败关闭', () => {
  it('env 文件缺失抛错而非返回跳过', () => {
    expect(() =>
      decideRealBackendPrerequisite({ ...READY, envAvailable: false }, { strict: true }),
    ).toThrow(/严格模式/);
  });

  it('前端真实通道不可达抛错而非返回跳过', () => {
    expect(() =>
      decideRealBackendPrerequisite(
        { ...READY, frontendChannelAvailable: false },
        { strict: true },
      ),
    ).toThrow(/前端真实通道不可达/);
  });

  it('后端不可用或不可登录抛错而非返回跳过', () => {
    expect(() =>
      decideRealBackendPrerequisite({ ...READY, backendAvailable: false }, { strict: true }),
    ).toThrow(/本地后端不可用或不可登录/);
  });

  it('全部就绪时不抛错，返回 null', () => {
    expect(decideRealBackendPrerequisite(READY, { strict: true })).toBeNull();
  });

  it('未显式传 strict 时以进程开关为准', () => {
    process.env[DEDICATED_E2E_STRICT_MODE_ENV] = '1';

    try {
      expect(() => decideRealBackendPrerequisite({ ...READY, backendAvailable: false })).toThrow(
        /严格模式/,
      );
    } finally {
      delete process.env[DEDICATED_E2E_STRICT_MODE_ENV];
    }
  });

  it('错误文本不包含密码或 Token 值', () => {
    let message = '';

    try {
      decideRealBackendPrerequisite({ ...READY, backendAvailable: false }, { strict: true });
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).not.toMatch(/password|token/i);
  });
});
