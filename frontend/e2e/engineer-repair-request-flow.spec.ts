// e2e/engineer-repair-request-flow.spec.ts

/**
 * 前端浏览器流程测试（GraphQL Mock），不是完整真实前后端 E2E：
 *
 * - 真实部分：页面、路由、表单、feature application 编排与 adapter 错误映射；
 * - mock 部分：GraphQL 传输层由 page.route 拦截，不连接 MySQL，也不启动 backend；
 * - 真实 MySQL → Backend → 前端契约链路由 backend/test 的 GraphQL E2E 覆盖
 *   （test/06-repair-request/repair-request-response.e2e-spec.ts）；
 * - mock 一律由业务事件驱动（如「接单 Mutation 已发生」「回复 Mutation 已发生」），
 *   不靠固定请求序号推测流程阶段：dev 下 StrictMode 会让首次详情查询执行两次，
 *   序号推测会让用例与环境请求行为耦合；详情请求数只做相对基线断言。
 */

import { expect, type Page, type Route, test } from '@playwright/test';

import { seedAuthSession } from './helpers/auth-session-seed';

const ENGINEER_HOME_PATH = '/engineer';
const LIST_PAGE_PATH = '/engineer/repair-requests';
/** 详情/接单/回复用例共用的目标申请 ID（mock 数据，不来自数据库） */
const REQUEST_ID = 8802;

/**
 * 回复 Mutation 的契约变量：只有 requestId / responseText / resolutionStatus，
 * 接单工程师与客户归属由后端 Session 派生，客户端不可传入。
 */
type CreateResponseVariables = {
  requestId: number;
  responseText: string;
  resolutionStatus: string;
};

type GraphQLOperationPayload = {
  query?: string;
  variables?: { id?: number; scope?: string; input?: CreateResponseVariables };
};

// 与后端真实契约对齐的 mock 数据：字段见 repair-request-read.dto / engineer-repair-request-adapter
const MOCK_MODEL = { id: 8801, modelCode: 'E2E-LS', modelName: '光刻机 E2E' };

/** 回复 mock 的工程师昵称：后端由 Session 派生，此处与预置会话昵称保持一致 */
const MOCK_ENGINEER_NICKNAME = '测试会话';

/** 回复时间线 mock 项：字段与后端 EngineerResponse 读模型一致 */
type MockResponseItem = {
  id: number;
  engineerNickname: string;
  resolutionStatus: 'PENDING' | 'RESOLVED';
  responseText: string;
  createdAt: string;
};

/** 详情中已存在的历史回复：用于验证新回复是追加而非覆盖 */
const MOCK_EXISTING_RESPONSE: MockResponseItem = {
  id: 61,
  engineerNickname: MOCK_ENGINEER_NICKNAME,
  resolutionStatus: 'PENDING',
  responseText: '已初步处理，等待备件',
  createdAt: '2026-09-02T10:00:00.000Z',
};

/** 本次提交在服务端产生的回复 ID（严格晚于历史回复） */
const SUBMITTED_RESPONSE_ID = 62;

/** 由本次 Mutation 变量派生服务端回复：只回显契约内字段，不虚构归属 */
function buildSubmittedResponse(variables: CreateResponseVariables): MockResponseItem {
  return {
    id: SUBMITTED_RESPONSE_ID,
    engineerNickname: MOCK_ENGINEER_NICKNAME,
    resolutionStatus: variables.resolutionStatus === 'RESOLVED' ? 'RESOLVED' : 'PENDING',
    responseText: variables.responseText,
    createdAt: '2026-09-02T11:00:00.000Z',
  };
}

function buildDetailDTO(id: number, isAccepted: boolean, responses: MockResponseItem[] = []) {
  return {
    id,
    requestNo: `RR20260902000000AC${id}`,
    equipmentModel: MOCK_MODEL,
    errorCode: 'E-9001',
    faultDescription: '曝光平台漂移，需现场检修',
    contentMd: '# E2E 测试申请',
    createdAt: '2026-09-01T08:00:00.000Z',
    isAccepted,
    acceptedAt: isAccepted ? '2026-09-02T09:00:00.000Z' : null,
    // mock 服务端读模型口径：最新处理状态取时间线末条（createdAt ASC + id ASC），
    // 与后端 QueryService 同口径，避免各用例硬编码出与时间线自相矛盾的详情
    latestResolutionStatus: responses[responses.length - 1]?.resolutionStatus ?? null,
    responses,
  };
}

function fulfillList(route: Route, scope: 'AVAILABLE' | 'MINE') {
  const items =
    scope === 'AVAILABLE'
      ? [
          {
            id: 8802,
            requestNo: 'RR20260902000000AC8802',
            equipmentModel: MOCK_MODEL,
            errorCode: 'E-9001',
            createdAt: '2026-09-01T08:00:00.000Z',
            isAccepted: false,
            acceptedAt: null,
            latestResolutionStatus: null,
          },
        ]
      : [];

  return route.fulfill({
    body: JSON.stringify({
      data: {
        engineerRepairRequests: { items, total: items.length, page: 1, pageSize: 10 },
      },
    }),
    contentType: 'application/json',
    status: 200,
  });
}

function fulfillDetail(
  route: Route,
  id: number,
  isAccepted: boolean,
  responses: MockResponseItem[] = [],
) {
  return route.fulfill({
    body: JSON.stringify({
      data: { engineerRepairRequest: buildDetailDTO(id, isAccepted, responses) },
    }),
    contentType: 'application/json',
    status: 200,
  });
}

function fulfillConflict(route: Route) {
  // 与后端 DomainError 真实输出对齐：CONFLICT + REPAIR_REQUEST_ALREADY_ACCEPTED
  return route.fulfill({
    body: JSON.stringify({
      errors: [
        {
          extensions: {
            code: 'CONFLICT',
            errorCode: 'REPAIR_REQUEST_ALREADY_ACCEPTED',
            errorMessage: '维修申请已被接单，请刷新后查看最新状态',
            details: { requestId: 8802 },
          },
          message: 'internal detail',
        },
      ],
    }),
    contentType: 'application/json',
    status: 200,
  });
}

function fulfillAcceptSystemFailure(route: Route) {
  // 与后端 DomainError 真实输出对齐：INTERNAL_SERVER_ERROR + REPAIR_REQUEST_ACCEPT_FAILED
  // （adapter 主映射仅依赖大类码，本 mock 走真实映射路径收敛为 accept-failed）
  return route.fulfill({
    body: JSON.stringify({
      errors: [
        {
          extensions: {
            code: 'INTERNAL_SERVER_ERROR',
            errorCode: 'REPAIR_REQUEST_ACCEPT_FAILED',
            errorMessage: '维修申请接单失败，请稍后重试',
            details: { requestId: 8802 },
          },
          message: 'internal detail',
        },
      ],
    }),
    contentType: 'application/json',
    status: 200,
  });
}

function fulfillAcceptSuccess(route: Route, id: number) {
  return route.fulfill({
    body: JSON.stringify({
      data: { acceptRepairRequest: buildDetailDTO(id, true) },
    }),
    contentType: 'application/json',
    status: 200,
  });
}

function fulfillNotAccessible(route: Route) {
  return route.fulfill({
    body: JSON.stringify({
      errors: [
        {
          extensions: {
            code: 'NOT_FOUND',
            errorCode: 'REPAIR_REQUEST_NOT_FOUND',
            errorMessage: '维修申请不存在或已删除',
          },
          message: 'internal detail',
        },
      ],
    }),
    contentType: 'application/json',
    status: 200,
  });
}

function fulfillCreateResponseSuccess(route: Route, response: MockResponseItem) {
  return route.fulfill({
    body: JSON.stringify({ data: { createEngineerResponse: response } }),
    contentType: 'application/json',
    status: 200,
  });
}

/**
 * 回复业务拒绝：与后端 DomainError 真实输出对齐（大类码 + 细节码 + 用户文案）。
 * adapter 主映射只依赖 extensions.code 大类，errorCode 仅用于 mock 保真。
 */
function fulfillCreateResponseRejection(
  route: Route,
  rejection: { code: string; errorCode: string; errorMessage: string },
) {
  return route.fulfill({
    body: JSON.stringify({
      errors: [
        {
          extensions: { ...rejection, details: { requestId: REQUEST_ID } },
          message: 'internal detail',
        },
      ],
    }),
    contentType: 'application/json',
    status: 200,
  });
}

/** 尚未接单（CONFLICT / REPAIR_REQUEST_NOT_ACCEPTED）：确定的业务拒绝 */
function fulfillResponseNotAccepted(route: Route) {
  return fulfillCreateResponseRejection(route, {
    code: 'CONFLICT',
    errorCode: 'REPAIR_REQUEST_NOT_ACCEPTED',
    errorMessage: '维修申请尚未接单，请先接单后回复',
  });
}

/**
 * 落库失败（INTERNAL_SERVER_ERROR / REPAIR_REQUEST_RESPONSE_FAILED）：
 * 结果不确定（回复可能已写入），前端只能重查确认，绝不自动重发。
 */
function fulfillResponseSystemFailure(route: Route) {
  return fulfillCreateResponseRejection(route, {
    code: 'INTERNAL_SERVER_ERROR',
    errorCode: 'REPAIR_REQUEST_RESPONSE_FAILED',
    errorMessage: '处理回复失败，请稍后重试',
  });
}

// 按操作名分派 GraphQL mock：列表按 scope 变量区分，详情/接单/回复由各测试注入
async function routeEngineerGraphQL(
  page: Page,
  handlers: {
    onDetail?: (route: Route) => Promise<void> | void;
    onAccept?: (route: Route) => Promise<void> | void;
    onCreateResponse?: (route: Route, variables: CreateResponseVariables) => Promise<void> | void;
  } = {},
) {
  let listRequests = 0;
  let acceptRequests = 0;
  let detailRequests = 0;
  let createResponseRequests = 0;
  let lastCreateResponseVariables: CreateResponseVariables | null = null;

  await page.route('**/graphql', async (route) => {
    const payload = route.request().postDataJSON() as GraphQLOperationPayload;

    if (payload.query?.includes('query EngineerRepairRequests')) {
      listRequests += 1;
      await fulfillList(route, payload.variables?.scope === 'MINE' ? 'MINE' : 'AVAILABLE');
      return;
    }

    if (payload.query?.includes('mutation AcceptRepairRequest')) {
      acceptRequests += 1;
      await (handlers.onAccept ?? ((r: Route) => fulfillAcceptSuccess(r, REQUEST_ID)))(route);
      return;
    }

    if (payload.query?.includes('mutation CreateEngineerResponse')) {
      createResponseRequests += 1;
      const variables = payload.variables?.input;
      lastCreateResponseVariables = variables ?? null;

      // 契约外请求（缺少 input）不猜测语义，直接暴露为服务端错误
      if (!variables) {
        await route.fulfill({ status: 500 });
        return;
      }

      await (
        handlers.onCreateResponse ??
        ((r: Route, submitted: CreateResponseVariables) =>
          fulfillCreateResponseSuccess(r, buildSubmittedResponse(submitted)))
      )(route, variables);
      return;
    }

    if (payload.query?.includes('query EngineerRepairRequest')) {
      detailRequests += 1;
      await (handlers.onDetail ?? ((r: Route) => fulfillDetail(r, REQUEST_ID, false)))(route);
      return;
    }

    await route.fulfill({ status: 500 });
  });

  return {
    getListRequests: () => listRequests,
    getAcceptRequests: () => acceptRequests,
    getDetailRequests: () => detailRequests,
    getCreateResponseRequests: () => createResponseRequests,
    getCreateResponseVariables: () => lastCreateResponseVariables,
  };
}

async function openDetailFromList(page: Page) {
  await page.goto(ENGINEER_HOME_PATH);
  await page.getByRole('button', { name: '进入维修申请' }).click();
  await expect(page).toHaveURL(new RegExp(LIST_PAGE_PATH));
  await expect(page.getByText('RR20260902000000AC8802')).toBeVisible();

  await page.getByText('RR20260902000000AC8802').click();
  await expect(page).toHaveURL(/\/engineer\/repair-requests\/8802$/);
}

// ---------- 前端浏览器流程测试（GraphQL Mock）：覆盖工程师列表查看与接单闭环 ----------

test('engineer discovers the list from the home entry and opens the detail', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');
  await routeEngineerGraphQL(page);

  await openDetailFromList(page);

  await expect(page.getByText('RR20260902000000AC8802')).toBeVisible();
  await expect(page.getByText('曝光平台漂移，需现场检修')).toBeVisible();
  await expect(page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ })).toBeVisible();
});

test('engineer accepts with confirm: exactly one mutation and the panel turns accepted', async ({
  page,
}) => {
  await seedAuthSession(page, 'ENGINEER');
  const { getAcceptRequests, getListRequests } = await routeEngineerGraphQL(page, {
    // 列表失效由 application 层单测覆盖；本浏览器用例只验证接单后详情原子更新
  });

  await openDetailFromList(page);

  await page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ }).click();
  await expect(page.getByText('确认接单该维修申请？')).toBeVisible();
  // 未确认不发送 Mutation
  expect(getAcceptRequests()).toBe(0);

  await page.getByRole('button', { name: '确认接单' }).click();

  await expect(page.getByText('你已接单该维修申请，后续请跟进处理。')).toBeVisible();
  await expect(page.getByText('已接单', { exact: true }).first()).toBeVisible();
  // 只发送一次 Mutation，详情来自 Mutation 返回值，不重查详情
  expect(getAcceptRequests()).toBe(1);
  expect(getListRequests()).toBe(1);
});

test('uncertain accept result re-verifies the detail without resending the mutation', async ({
  page,
}) => {
  // 前端浏览器流程测试（GraphQL Mock）：
  // 接单 Mutation 返回系统失败（结果不确定）后，只重查详情确认，不自动重发 Mutation；
  // 重查发现已由当前工程师接单时，页面展示已接单状态且接单按钮消失，
  // 失败反馈同步收敛为成功，不保留矛盾的“接单失败”提示
  await seedAuthSession(page, 'ENGINEER');

  let detailRequests = 0;
  let acceptCalled = false;
  const { getAcceptRequests } = await routeEngineerGraphQL(page, {
    onAccept: (route) => {
      acceptCalled = true;
      return fulfillAcceptSystemFailure(route);
    },
    onDetail: (route) => {
      detailRequests += 1;
      // 挂钩业务事件：接单 Mutation 已发出后的详情请求（重查）返回已接单，
      // 不依赖请求序号，避免与环境请求行为（双调/预取/重试）耦合
      return fulfillDetail(route, 8802, acceptCalled);
    },
  });

  await openDetailFromList(page);
  await expect(page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ })).toBeVisible();
  // 详情请求数只作相对断言：接单失败后的重查恰为接单前基线 +1
  const detailRequestsBeforeAccept = detailRequests;

  await page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ }).click();
  await page.getByRole('button', { name: '确认接单' }).click();

  // 接单 Mutation 只发送一次；失败后自动重查详情（且只重查一次），收敛为已接单状态，接单按钮消失
  await expect(page.getByText('已接单', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ })).toHaveCount(0);
  expect(getAcceptRequests()).toBe(1);
  expect(detailRequests).toBe(detailRequestsBeforeAccept + 1);

  // 重查确认已接单后：展示成功反馈，不再保留矛盾的“接单失败”提示
  await expect(page.getByText('你已接单该维修申请，后续请跟进处理。')).toBeVisible();
  await expect(page.getByText('接单失败，请稍后重试')).toHaveCount(0);
});

test('accept conflict keeps the backend message and offers a way back to the list', async ({
  page,
}) => {
  await seedAuthSession(page, 'ENGINEER');
  let routeDetailRequests = 0;
  const { getAcceptRequests } = await routeEngineerGraphQL(page, {
    // 接单冲突后重查：申请已被接走，当前工程师不再可读
    onAccept: fulfillConflict,
    onDetail: (route) => {
      if (!routeDetailRequests) {
        routeDetailRequests += 1;
        return fulfillDetail(route, 8802, false);
      }

      return fulfillNotAccessible(route);
    },
  });

  await page.goto(`${LIST_PAGE_PATH}/8802`);
  await page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ }).click();
  await page.getByRole('button', { name: '确认接单' }).click();

  // 冲突提示不被通用不可访问文案掩盖
  await expect(page.getByText('维修申请已被接单，请刷新后查看最新状态')).toBeVisible();
  await expect(page.getByRole('button', { name: '返回维修申请列表' })).toBeVisible();
  expect(getAcceptRequests()).toBe(1);

  await page.getByRole('button', { name: '返回维修申请列表' }).click();
  await expect(page).toHaveURL(new RegExp(LIST_PAGE_PATH));
});

test('super admin can read the detail but never sees the accept action', async ({ page }) => {
  await seedAuthSession(page, 'SUPER_ADMIN');
  await routeEngineerGraphQL(page);

  await page.goto(`${LIST_PAGE_PATH}/8802`);

  await expect(page.getByText('RR20260902000000AC8802')).toBeVisible();
  await expect(page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ })).toHaveCount(0);
  await expect(page.getByText('当前账号仅可查看详情，接单需使用工程师账号。')).toBeVisible();
});

test('empty available scope shows the scoped empty state', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');
  await routeEngineerGraphQL(page);

  await page.goto(LIST_PAGE_PATH);
  // 默认 AVAILABLE 范围有数据；切到 MINE 范围返回空态
  await page.getByText('我的接单').click();

  await expect(page.getByText('暂无你的接单记录。')).toBeVisible();
});

test('list load failure shows the error with a retry entry', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');

  let listRequests = 0;
  await page.route('**/graphql', async (route) => {
    const payload = route.request().postDataJSON() as GraphQLOperationPayload;

    if (payload.query?.includes('query EngineerRepairRequests')) {
      listRequests += 1;
      // 首次 transport 失败（共享错误模型文案），重试放行
      if (listRequests === 1) {
        return route.abort('failed');
      }

      return fulfillList(route, 'AVAILABLE');
    }

    return route.fulfill({ status: 500 });
  });

  await page.goto(LIST_PAGE_PATH);
  await expect(page.getByText('网络连接异常，请稍后重试。')).toBeVisible();

  await page.getByRole('button', { name: /^重\s*试$/ }).click();
  await expect(page.getByText('RR20260902000000AC8802')).toBeVisible();
  expect(listRequests).toBe(2);
});

/* ------------------------------------------------------------------ */
/* 工程师回复：前端浏览器流程测试（GraphQL Mock）                       */
/* ------------------------------------------------------------------ */

/** 回复草稿正文：用于验证成功后清空、失败/不确定时保留 */
const RESPONSE_DRAFT = '已更换备件，待观察';
/** 结果不确定态的引导文案（面板 response-failed 分支） */
const RESPONSE_UNCERTAIN_HINT = '回复可能已提交成功，请刷新后检查回复时间线，避免重复提交。';

/** 直达详情页（回复用例不经列表，避免列表请求与计数互相干扰） */
async function openResponseDetail(page: Page) {
  await page.goto(`${LIST_PAGE_PATH}/${REQUEST_ID}`);
  await expect(page.getByText(`RR20260902000000AC${REQUEST_ID}`)).toBeVisible();
}

async function fillResponseDraft(page: Page, text = RESPONSE_DRAFT) {
  await page.getByLabel('回复正文').fill(text);
}

/** 处理状态初始为 PENDING（处理中），仅在需要验证状态传参时切换 */
async function selectResolutionStatus(page: Page, label: '处理中' | '已解决') {
  await page.getByRole('combobox').click();
  // 虚拟列表下可见选项不带 role="option"（该 role 属于隐藏的 a11y 列表，内容为枚举原值），
  // 因此按 antd 下拉选项的 class + title 精确定位可见项
  await page.locator(`.ant-select-dropdown .ant-select-item-option[title="${label}"]`).click();
}

async function submitResponse(page: Page) {
  // antd 的 loading 按钮 accessible name 带 "loading " 前缀，且不加 disabled 属性
  await page.getByRole('button', { name: /^(loading\s+)?提交回复$/ }).click();
}

/** 延迟放行门：由测试按业务事件放行，用于观察提交中/收敛中禁用态（不用固定 sleep） */
function createGate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/**
 * 回复时间线容器。
 * 时间线断言必须限定在本容器内：Playwright 的 getByText 会匹配 textarea 的当前值，
 * 直接用页面级文本断言会把「草稿」误判为「已写入时间线」造成假通过。
 */
function timelineOf(page: Page) {
  return page.locator('.ant-timeline');
}

/**
 * 处理状态选择框的已选值容器。
 * antd 6 的 Select 已不再渲染 `.ant-select-selector`，单选值落在
 * `.ant-select-content`（内部为选中项 label），因此按该容器断言草稿选择。
 */
function statusSelectOf(page: Page) {
  return page.locator('.ant-select-content');
}

test('engineer sees the response form on an accepted request and no accept entry', async ({
  page,
}) => {
  await seedAuthSession(page, 'ENGINEER');
  await routeEngineerGraphQL(page, {
    onDetail: (route) => fulfillDetail(route, REQUEST_ID, true, [MOCK_EXISTING_RESPONSE]),
  });

  await openResponseDetail(page);

  // 精确 ENGINEER + 已接单：展示回复表单与已有回复时间线
  await expect(page.getByText('追加处理回复')).toBeVisible();
  await expect(page.getByLabel('回复正文')).toBeVisible();
  await expect(page.getByRole('button', { name: /^(loading\s+)?提交回复$/ })).toBeVisible();
  await expect(timelineOf(page)).toContainText(MOCK_EXISTING_RESPONSE.responseText);
  // 已接单后不再提供接单入口
  await expect(page.getByRole('button', { name: /^(loading\s+)?接\s*单$/ })).toHaveCount(0);
});

test('unaccepted request exposes no response form and prompts to accept first', async ({
  page,
}) => {
  await seedAuthSession(page, 'ENGINEER');
  await routeEngineerGraphQL(page, {
    onDetail: (route) => fulfillDetail(route, REQUEST_ID, false),
  });

  await openResponseDetail(page);

  await expect(page.getByText('请先接单后才能回复该申请。')).toBeVisible();
  await expect(page.getByLabel('回复正文')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(loading\s+)?提交回复$/ })).toHaveCount(0);
});

test('super admin reads the accepted detail without any response entry', async ({ page }) => {
  await seedAuthSession(page, 'SUPER_ADMIN');
  await routeEngineerGraphQL(page, {
    onDetail: (route) => fulfillDetail(route, REQUEST_ID, true, [MOCK_EXISTING_RESPONSE]),
  });

  await openResponseDetail(page);

  // 只读账号可阅读详情与回复时间线，但没有回复提交入口
  await expect(timelineOf(page)).toContainText(MOCK_EXISTING_RESPONSE.responseText);
  await expect(page.getByText('当前账号仅可查看详情，回复需使用工程师账号。')).toBeVisible();
  await expect(page.getByLabel('回复正文')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^(loading\s+)?提交回复$/ })).toHaveCount(0);
});

test('engineer submits a response: one mutation, exact variables, atomic timeline', async ({
  page,
}) => {
  await seedAuthSession(page, 'ENGINEER');

  let mutationHappened = false;
  let detailAfterMutation = 0;

  const { getCreateResponseRequests, getCreateResponseVariables } = await routeEngineerGraphQL(
    page,
    {
      onDetail: (route) => {
        // 详情响应始终只有历史回复：时间线出现新回复只可能来自
        // Mutation 返回值的原子注入，而不是重查
        if (mutationHappened) {
          detailAfterMutation += 1;
        }
        return fulfillDetail(route, REQUEST_ID, true, [MOCK_EXISTING_RESPONSE]);
      },
      onCreateResponse: (route, variables) => {
        mutationHappened = true;
        return fulfillCreateResponseSuccess(route, buildSubmittedResponse(variables));
      },
    },
  );

  await openResponseDetail(page);
  await fillResponseDraft(page);
  await selectResolutionStatus(page, '已解决');
  await submitResponse(page);

  await expect(page.getByText('回复已提交。')).toBeVisible();

  // Mutation 恰好一次；变量精确等于契约三字段（toEqual 为全等匹配，
  // 多出任何账号归属字段都会失败）
  expect(getCreateResponseRequests()).toBe(1);
  expect(getCreateResponseVariables()).toEqual({
    requestId: REQUEST_ID,
    responseText: RESPONSE_DRAFT,
    resolutionStatus: 'RESOLVED',
  });

  // 时间线原子追加：历史回复不丢失，新回复立即可见，且不重查详情
  await expect(timelineOf(page)).toContainText(MOCK_EXISTING_RESPONSE.responseText);
  await expect(timelineOf(page)).toContainText(RESPONSE_DRAFT);
  await expect(
    page.locator('.ant-descriptions-row').filter({ hasText: '最新处理状态' }),
  ).toContainText('已解决');
  expect(detailAfterMutation).toBe(0);

  // 成功后表单重置：正文清空，处理状态回到初始 PENDING
  await expect(page.getByLabel('回复正文')).toHaveValue('');
  await expect(statusSelectOf(page)).toContainText('处理中');
});

test('rapid repeat clicks while submitting send exactly one mutation', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');

  const gate = createGate();
  const { getCreateResponseRequests } = await routeEngineerGraphQL(page, {
    onDetail: (route) => fulfillDetail(route, REQUEST_ID, true, [MOCK_EXISTING_RESPONSE]),
    // 提交进行中：响应挂起，保持 submitting 为真
    onCreateResponse: async (route, variables) => {
      await gate.promise;
      return fulfillCreateResponseSuccess(route, buildSubmittedResponse(variables));
    },
  });

  await openResponseDetail(page);
  await fillResponseDraft(page);
  await submitResponse(page);

  // 提交中：按钮 loading、输入控件禁用；连点被拦（antd loading + application ref 锁）
  await expect(page.getByRole('button', { name: /^(loading\s+)?提交回复$/ })).toHaveClass(
    /ant-btn-loading/,
  );
  await expect(page.getByLabel('回复正文')).toBeDisabled();
  await submitResponse(page);
  await submitResponse(page);
  expect(getCreateResponseRequests()).toBe(1);

  gate.release();

  await expect(page.getByText('回复已提交。')).toBeVisible();
  expect(getCreateResponseRequests()).toBe(1);
});

test('definite rejection keeps the backend feedback and the user draft', async ({ page }) => {
  await seedAuthSession(page, 'ENGINEER');

  let mutationHappened = false;
  let detailAfterMutation = 0;

  const { getCreateResponseRequests } = await routeEngineerGraphQL(page, {
    onDetail: (route) => {
      if (mutationHappened) {
        detailAfterMutation += 1;
      }
      return fulfillDetail(route, REQUEST_ID, true, [MOCK_EXISTING_RESPONSE]);
    },
    // 详情加载后服务端裁决申请尚未接单：确定的业务拒绝（CONFLICT → not-accepted）
    onCreateResponse: (route) => {
      mutationHappened = true;
      return fulfillResponseNotAccepted(route);
    },
  });

  await openResponseDetail(page);
  await fillResponseDraft(page);
  await selectResolutionStatus(page, '已解决');
  await submitResponse(page);

  // 展示后端用户文案；确定拒绝不进入结果不确定态，没有重新加载入口
  await expect(page.getByText('维修申请尚未接单，请先接单后回复')).toBeVisible();
  await expect(page.getByRole('button', { name: '重新加载详情' })).toHaveCount(0);

  // 草稿保留（正文与状态选择），时间线不变，不重查详情，不重发 Mutation
  await expect(page.getByLabel('回复正文')).toHaveValue(RESPONSE_DRAFT);
  await expect(statusSelectOf(page)).toContainText('已解决');
  await expect(timelineOf(page)).toContainText(MOCK_EXISTING_RESPONSE.responseText);
  await expect(timelineOf(page)).not.toContainText(RESPONSE_DRAFT);
  expect(detailAfterMutation).toBe(0);
  expect(getCreateResponseRequests()).toBe(1);
});

test('uncertain result re-checks silently and converges without resending the mutation', async ({
  page,
}) => {
  await seedAuthSession(page, 'ENGINEER');

  const gate = createGate();
  let submitted: CreateResponseVariables | null = null;
  let recheckRequests = 0;

  const { getCreateResponseRequests } = await routeEngineerGraphQL(page, {
    onDetail: async (route) => {
      const submittedVariables = submitted;

      // 业务事件驱动：回复 Mutation 已发生 ⇒ 重查返回含本次回复的时间线；
      // Mutation 之前的详情请求（含 StrictMode 双调）只有历史回复
      if (submittedVariables === null) {
        return fulfillDetail(route, REQUEST_ID, true, [MOCK_EXISTING_RESPONSE]);
      }

      recheckRequests += 1;
      // 收敛重查挂起，用于观察「自动静默重查进行中」的禁用态
      await gate.promise;

      return fulfillDetail(route, REQUEST_ID, true, [
        MOCK_EXISTING_RESPONSE,
        buildSubmittedResponse(submittedVariables),
      ]);
    },
    onCreateResponse: (route, variables) => {
      submitted = variables;
      return fulfillResponseSystemFailure(route);
    },
  });

  await openResponseDetail(page);
  await fillResponseDraft(page);
  await selectResolutionStatus(page, '已解决');
  await submitResponse(page);

  // 结果不确定：展示后端失败文案与不确定引导
  await expect(page.getByText('处理回复失败，请稍后重试')).toBeVisible();
  await expect(page.getByText(RESPONSE_UNCERTAIN_HINT)).toBeVisible();

  // 自动静默重查进行中：详情与表单不卸载（无骨架屏），草稿与状态选择保留，控件禁用
  await expect(page.locator('.ant-skeleton')).toHaveCount(0);
  await expect(page.getByLabel('回复正文')).toBeDisabled();
  await expect(page.getByLabel('回复正文')).toHaveValue(RESPONSE_DRAFT);
  await expect(statusSelectOf(page)).toContainText('已解决');

  // 自动收敛期间手动「重新加载详情」禁用；强制点击也不得形成并行重查
  const reloadButton = page.getByRole('button', { name: '重新加载详情' });
  await expect(reloadButton).toBeDisabled();
  await reloadButton.click({ force: true });

  gate.release();

  // 重查匹配到本次回复：反馈收敛为成功，不确定引导消失，草稿清空
  await expect(page.getByText('回复已提交。')).toBeVisible();
  await expect(page.getByText(RESPONSE_UNCERTAIN_HINT)).toHaveCount(0);
  await expect(page.getByLabel('回复正文')).toHaveValue('');

  // 时间线追加本次回复，最新处理状态同步更新（均来自同一次静默重查）
  await expect(timelineOf(page)).toContainText(MOCK_EXISTING_RESPONSE.responseText);
  await expect(timelineOf(page)).toContainText(RESPONSE_DRAFT);
  await expect(
    page.locator('.ant-descriptions-row').filter({ hasText: '最新处理状态' }),
  ).toContainText('已解决');

  // 绝不自动重发 Mutation；自动收敛只静默重查一次（手动点击未叠加请求）
  expect(getCreateResponseRequests()).toBe(1);
  expect(recheckRequests).toBe(1);
});

test('uncertain result keeps detail, feedback and draft when the silent re-check fails', async ({
  page,
}) => {
  await seedAuthSession(page, 'ENGINEER');

  let submitted: CreateResponseVariables | null = null;
  let recheckRequests = 0;

  const { getCreateResponseRequests } = await routeEngineerGraphQL(page, {
    onDetail: (route) => {
      if (submitted === null) {
        return fulfillDetail(route, REQUEST_ID, true, [MOCK_EXISTING_RESPONSE]);
      }

      // 收敛重查 transport 失败：结果仍不确定
      recheckRequests += 1;
      return route.abort('failed');
    },
    onCreateResponse: (route, variables) => {
      submitted = variables;
      return fulfillResponseSystemFailure(route);
    },
  });

  await openResponseDetail(page);
  await fillResponseDraft(page);
  await submitResponse(page);

  // 重查失败：静默重查不改查询状态机，当前详情与既有时间线保留（无骨架屏）
  await expect(page.locator('.ant-skeleton')).toHaveCount(0);
  await expect(timelineOf(page)).toContainText(MOCK_EXISTING_RESPONSE.responseText);
  await expect(timelineOf(page)).not.toContainText(RESPONSE_DRAFT);

  // 不确定反馈与草稿保留，收敛结束后手动重查入口恢复可用
  await expect(page.getByText(RESPONSE_UNCERTAIN_HINT)).toBeVisible();
  await expect(page.getByLabel('回复正文')).toHaveValue(RESPONSE_DRAFT);
  await expect(page.getByRole('button', { name: '重新加载详情' })).toBeEnabled();

  // 只重查一次，绝不自动重发 Mutation
  expect(recheckRequests).toBe(1);
  expect(getCreateResponseRequests()).toBe(1);
});

test('unmatched re-check keeps the draft and the manual re-check never clears it', async ({
  page,
}) => {
  await seedAuthSession(page, 'ENGINEER');

  let submitted: CreateResponseVariables | null = null;
  let manualRecheck = false;
  let recheckRequests = 0;

  const { getCreateResponseRequests } = await routeEngineerGraphQL(page, {
    onDetail: (route) => {
      const submittedVariables = submitted;

      if (submittedVariables === null) {
        return fulfillDetail(route, REQUEST_ID, true, [MOCK_EXISTING_RESPONSE]);
      }

      recheckRequests += 1;

      // 自动收敛重查：服务端尚未出现匹配回复（无法确认已写入）；
      // 用户手动重新检查之后才返回已写入的时间线
      if (!manualRecheck) {
        return fulfillDetail(route, REQUEST_ID, true, [MOCK_EXISTING_RESPONSE]);
      }

      return fulfillDetail(route, REQUEST_ID, true, [
        MOCK_EXISTING_RESPONSE,
        buildSubmittedResponse(submittedVariables),
      ]);
    },
    onCreateResponse: (route, variables) => {
      submitted = variables;
      return fulfillResponseSystemFailure(route);
    },
  });

  await openResponseDetail(page);
  await fillResponseDraft(page);
  await submitResponse(page);

  // 自动重查无匹配：详情、草稿与不确定反馈全部保留（时间线不含本次草稿）
  await expect(page.getByText(RESPONSE_UNCERTAIN_HINT)).toBeVisible();
  await expect(page.getByLabel('回复正文')).toHaveValue(RESPONSE_DRAFT);
  await expect(timelineOf(page)).not.toContainText(RESPONSE_DRAFT);
  expect(recheckRequests).toBe(1);

  // 收敛结束后允许用户手动重新检查（以用户点击为业务事件，不靠请求序号）
  manualRecheck = true;
  await page.getByRole('button', { name: '重新加载详情' }).click();

  // 手动静默重查：时间线更新，但表单不卸载、草稿不清空、反馈仍为结果不确定
  await expect(timelineOf(page)).toContainText(RESPONSE_DRAFT);
  await expect(page.getByLabel('回复正文')).toHaveValue(RESPONSE_DRAFT);
  await expect(page.locator('.ant-skeleton')).toHaveCount(0);
  await expect(page.getByText(RESPONSE_UNCERTAIN_HINT)).toBeVisible();

  expect(recheckRequests).toBe(2);
  expect(getCreateResponseRequests()).toBe(1);
});
