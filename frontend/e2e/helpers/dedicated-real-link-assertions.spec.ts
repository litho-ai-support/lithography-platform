// e2e/helpers/dedicated-real-link-assertions.spec.ts
// @vitest-environment node
// 专用真实链路验收断言的单元测试（R4 修正轮 P5 失败对照 + P1 浏览器绑定守卫）。
//
// 命名与统计边界：本文件是**受控 mock 失败对照**（vitest），与 e2e-real/ 下的真实正向
// 用例（Playwright）分开命名、分开统计；失败对照绝不触真实数据库或真实后端。
//
// 覆盖：
// - GraphQL 返回 errors（HTTP 200）时，成功验收 helper 必须拒绝；
// - data.myAccountSettings 缺失时必须拒绝；
// - loginName 与专用账号不一致时必须拒绝；
// - 合法成功载荷（字段齐全、登录名匹配）必须通过并返回数据；
// - 浏览器请求出现 127.0.0.1:3000 或其他来源时绑定守卫必须拒绝；
// - 全部请求都落在专用前端（4174，同源代理）或专用后端（3100）时放行。

import { describe, expect, it } from 'vitest';

import {
  assertBrowserRequestsBoundToDedicatedOrigins,
  assertRealMyAccountSettingsSuccess,
  DEDICATED_BACKEND_ORIGIN,
  DEDICATED_FRONTEND_ORIGIN,
  isRequestBoundToDedicatedOrigins,
  PROHIBITED_DEV_ORIGIN,
} from './dedicated-real-link-assertions';

const DEDICATED_LOGIN_NAME = 'e2e-pw-1758000000000';

const VALID_SETTINGS = {
  companyName: null,
  contactEmail: null,
  loginEmail: 'e2e-pw@example.com',
  loginName: DEDICATED_LOGIN_NAME,
  nickname: 'E2E 改密专用账号',
  phone: null,
  role: 'ENGINEER',
  status: 'ACTIVE',
  updatedAt: '2026-09-21T00:00:00.000Z',
};

describe('真实 MyAccountSettings 数据级验收（受控 mock 失败对照）', () => {
  it('GraphQL 返回 errors（HTTP 200）时成功验收必须拒绝', () => {
    const payload = {
      data: null,
      errors: [{ extensions: { code: 'UNAUTHENTICATED' }, message: 'token expired' }],
    };

    expect(() => assertRealMyAccountSettingsSuccess(payload, DEDICATED_LOGIN_NAME)).toThrow(
      'MyAccountSettings 返回了 GraphQL errors，验收不通过',
    );
  });

  it('data.myAccountSettings 缺失时成功验收必须拒绝', () => {
    expect(() => assertRealMyAccountSettingsSuccess({ data: {} }, DEDICATED_LOGIN_NAME)).toThrow(
      '未返回 data.myAccountSettings',
    );
    expect(() => assertRealMyAccountSettingsSuccess(null, DEDICATED_LOGIN_NAME)).toThrow(
      '未返回 data.myAccountSettings',
    );
  });

  it('loginName 与专用账号不一致时成功验收必须拒绝', () => {
    const payload = {
      data: { myAccountSettings: { ...VALID_SETTINGS, loginName: 'someone_else' } },
    };

    expect(() => assertRealMyAccountSettingsSuccess(payload, DEDICATED_LOGIN_NAME)).toThrow(
      'loginName 与专用账号不一致',
    );
  });

  it('合法成功载荷：errors 为空、数据存在、登录名匹配——验收通过并返回数据', () => {
    const payload = { data: { myAccountSettings: VALID_SETTINGS } };

    expect(assertRealMyAccountSettingsSuccess(payload, DEDICATED_LOGIN_NAME)).toEqual(
      VALID_SETTINGS,
    );
  });
});

describe('专用环境浏览器流量绑定守卫（受控 mock 失败对照）', () => {
  it('出现 127.0.0.1:3000 的浏览器请求时守卫必须拒绝', () => {
    expect(() =>
      assertBrowserRequestsBoundToDedicatedOrigins([
        `${DEDICATED_FRONTEND_ORIGIN}/login`,
        `${PROHIBITED_DEV_ORIGIN}/graphql`,
      ]),
    ).toThrow('脱离专用环境的浏览器请求');
  });

  it('出现其他未知来源的浏览器请求时守卫必须拒绝', () => {
    expect(() =>
      assertBrowserRequestsBoundToDedicatedOrigins(['http://localhost:5173/graphql']),
    ).toThrow('脱离专用环境的浏览器请求');
  });

  it('全部请求落在专用前端（同源代理）或专用后端时放行', () => {
    expect(() =>
      assertBrowserRequestsBoundToDedicatedOrigins([
        `${DEDICATED_FRONTEND_ORIGIN}/`,
        `${DEDICATED_FRONTEND_ORIGIN}/graphql`,
        `${DEDICATED_FRONTEND_ORIGIN}/account/settings`,
        `${DEDICATED_BACKEND_ORIGIN}/health`,
        'data:image/svg+xml;base64,xxxx',
      ]),
    ).not.toThrow();
  });

  it('isRequestBoundToDedicatedOrigins：非 http(s) URL 不参与判定', () => {
    expect(isRequestBoundToDedicatedOrigins('about:blank')).toBe(true);
    expect(isRequestBoundToDedicatedOrigins(`${PROHIBITED_DEV_ORIGIN}/graphql`)).toBe(false);
    expect(isRequestBoundToDedicatedOrigins(`${DEDICATED_BACKEND_ORIGIN}/graphql`)).toBe(true);
  });
});
