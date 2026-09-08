// e2e/reference-document-real.spec.ts
// AI 参考资料库真实后端数据流 e2e（阶段三 T-03/T-04）。
//
// 数据基础：backend seed 预置参考资料 970001~970003（未软删，含通用/指定型号/
// 有 storage 引用三种形态）与 970004（已软删，默认不可见）；seed 行只做只读断言。
// 创建链路产生的自建行（标题固定 E2E 前缀）在用例结束前经 API 软删兜底清理
// （列表与详情对已软删行均不可见），再物理删除以恢复 seed:mock 的 COUNT 校验口径，
// 不污染共享开发库基线。
// 前提不满足（无本地后端 / 无 env）时用例自动跳过，不会以失败阻塞。

import { expect, test } from '@playwright/test';

import {
  deleteE2EReferenceDocumentRows,
  hasFrontendGraphQLEndpoint,
  isRealBackendAvailable,
  readBackendEnv,
  readBackendEnvOrNull,
  realGraphqlCall,
} from './helpers/real-backend';

const LIST_PATH = '/reference-documents';
const NEW_PAGE_PATH = '/reference-documents/new';

const SEED_ERROR_MANUAL_TITLE = 'NXT:1980Di 常见错误代码手册（Mock）';
const SEED_MAINTENANCE_GUIDE_TITLE = 'NXE:3400C 光源维护指南（Mock）';
const SEED_SAFETY_STANDARD_TITLE = '光刻机故障诊断安全规范（Mock）';
const SEED_DEPRECATED_TITLE = '旧版 XT 系列检查表（已停用 Mock）';

/** 自建行标题前缀：清理查询与列表断言都用它定位，避免误伤种子/他人数据 */
const E2E_TITLE_PREFIX = 'E2E 参考资料验收行';

const LIST_DOCUMENTS_QUERY = `
  query ReferenceDocuments($pagination: PaginationArgs!, $filter: ReferenceDocumentFilterInput) {
    referenceDocuments(pagination: $pagination, filter: $filter) {
      items { id title }
      total
      page
      pageSize
    }
  }
`;

const SOFT_DELETE_MUTATION = `
  mutation SoftDeleteReferenceDocument($id: Int!) {
    softDeleteReferenceDocument(id: $id) { id }
  }
`;

/** 按自建行标题前缀查询未软删的行 ID（Node 侧真实登录后调用；找不到返回 null） */
async function findE2EDocumentId(env: Record<string, string>): Promise<number | null> {
  const { body } = await realGraphqlCall(
    env,
    LIST_DOCUMENTS_QUERY,
    {
      pagination: { mode: 'OFFSET', page: 1, pageSize: 50, withTotal: true },
      filter: { title: E2E_TITLE_PREFIX },
    },
    'mock_super_admin',
  );
  const items = (
    body as {
      data?: { referenceDocuments?: { items?: Array<{ id: number; title: string }> } };
    }
  ).data?.referenceDocuments?.items;

  return items?.length ? items[0].id : null;
}

/**
 * 兜底清理：先经 API 软删本 spec 自建的未删行（对不存在/已软删行 NOT_FOUND，忽略即可），
 * 再物理删除自建行——软删行仍计入 seed:mock 的 COUNT 校验口径，物理删除才能恢复种子基线。
 */
async function cleanupE2EDocuments(env: Record<string, string>): Promise<void> {
  let id = await findE2EDocumentId(env);

  while (id !== null) {
    await realGraphqlCall(env, SOFT_DELETE_MUTATION, { id }, 'mock_super_admin');
    id = await findE2EDocumentId(env);
  }

  deleteE2EReferenceDocumentRows();
}

test.describe('real backend reference document flow', () => {
  test.beforeEach(async () => {
    const env = readBackendEnvOrNull();
    test.skip(
      env === null,
      'backend/env/.env.development 缺失（本地文件，不入库），跳过真实后端用例',
    );
    test.skip(
      !hasFrontendGraphQLEndpoint(),
      '前端真实通道不可达（未配置 VITE_GRAPHQL_ENDPOINT 且 vite dev server 无 /graphql 转发），跳过真实后端用例',
    );
    test.skip(
      !(await isRealBackendAvailable(env as Record<string, string>)),
      '本地后端不可用或不可登录，跳过真实后端用例',
    );
  });

  // T-03 主链路：管理员登录 → 列表（种子可见、已软删不可见）→ 新增指定型号资料 →
  // 成功页 → 详情 → 编辑 → 刷新持久 → 软删回列表且消失 → API 重复软删 NOT_FOUND（不幂等）。
  // 自建行经 try/finally 兜底软删清理。
  test('super admin full journey: list, create, edit, reload persistence and soft delete', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_super_admin');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/admin$/);

    // 导航入口可见（F-09）
    await expect(page.getByText('参考资料库')).toBeVisible();

    try {
      // 列表：种子资料可见（按创建时间倒序），已软删的 970004 不可见
      await page.goto(LIST_PATH);
      await expect(page.getByRole('heading', { name: '参考资料库' })).toBeVisible();
      await expect(page.getByText(SEED_ERROR_MANUAL_TITLE)).toBeVisible();
      await expect(page.getByText(SEED_MAINTENANCE_GUIDE_TITLE)).toBeVisible();
      await expect(page.getByText(SEED_SAFETY_STANDARD_TITLE)).toBeVisible();
      await expect(page.getByText(SEED_DEPRECATED_TITLE)).toHaveCount(0);

      // 新增指定型号资料
      await page.getByRole('button', { name: '新增资料' }).click();
      await expect(page).toHaveURL(new RegExp(NEW_PAGE_PATH));
      await page.getByLabel('文档标题').fill(`${E2E_TITLE_PREFIX}（光闸维护）`);
      // AntD Select 交互按维修申请先例：点击 combobox 打开下拉后点 option（label 点击不展开下拉）
      await page.getByRole('combobox').nth(0).click();
      await page.locator('.ant-select-item-option', { hasText: '检查表' }).click();
      // 型号下拉选项走真实 equipmentModels 查询，加载完成前 disabled，先等可用
      await expect(page.getByRole('combobox').nth(1)).toBeEnabled({ timeout: 10_000 });
      await page.getByRole('combobox').nth(1).click();
      await page.locator('.ant-select-item-option', { hasText: 'NXT:1980Di' }).click();
      await page.getByLabel('文档说明').fill('阶段三真实后端 e2e 自建行。');
      await page.getByLabel('文本内容').fill('# 光闸维护检查表\n\n每周检查光闸联锁与急停按钮。');
      await page.getByRole('button', { name: /创建资料/ }).click();

      // 成功页 → 查看详情
      await expect(page.getByText('参考资料创建成功')).toBeVisible();
      await page.getByRole('button', { name: '查看详情' }).click();
      await expect(page).toHaveURL(/\/reference-documents\/\d+$/);
      await expect(page.getByText(`${E2E_TITLE_PREFIX}（光闸维护）`).first()).toBeVisible();
      // 精确匹配：正文「光闸维护检查表」含同文子串，避免 strict mode violation（memory 先例）
      await expect(page.getByText('检查表', { exact: true })).toBeVisible();
      await expect(page.getByText('ASML TWINSCAN NXT:1980Di')).toBeVisible();
      await expect(page.getByText(/每周检查光闸联锁/)).toBeVisible();

      // 编辑：改标题 → 保存后详情刷新
      await page.getByRole('button', { name: /编\s*辑/ }).click();
      await page.getByLabel('文档标题').fill(`${E2E_TITLE_PREFIX}（光闸维护·已改）`);
      await page.getByRole('button', { name: /保存修改/ }).click();
      await expect(page.getByText('参考资料已保存。')).toBeVisible();
      await expect(page.getByText(`${E2E_TITLE_PREFIX}（光闸维护·已改）`).first()).toBeVisible();

      // 刷新持久（T-03：刷新仍在）
      await page.reload();
      await expect(page.getByText(`${E2E_TITLE_PREFIX}（光闸维护·已改）`).first()).toBeVisible();

      // 软删：二次确认 → 回列表且该行消失
      await page.getByRole('button', { name: '删 除' }).click();
      await page.getByRole('button', { name: '确认删除' }).click();
      await expect(page.getByText('参考资料已删除。')).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`${LIST_PATH}$`));
      await expect(page.getByText(`${E2E_TITLE_PREFIX}（光闸维护·已改）`)).toHaveCount(0);

      // 软删不幂等（区别于维修申请裁定 5）：API 重复删除返回统一 NOT_FOUND
      const listAfter = await findE2EDocumentId(env);
      expect(listAfter).toBeNull();
    } finally {
      // 兜底清理无条件执行：cleanupE2EDocuments 幂等（无未删行时跳过软删循环，
      // 物理删除仅匹配 E2E 前缀字面量、对种子行是 no-op），无论主链路中途失败
      // 还是页面内已软删，都能把自建行清理到 seed:mock COUNT 校验口径。
      await cleanupE2EDocuments(env);
    }
  });

  // T-03 筛选正确：类型等值筛选只命中目标资料；清空筛选恢复全量（种子行只读）
  test('list filter by document type narrows results and resets', async ({ page }) => {
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_super_admin');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto(LIST_PATH);
    await expect(page.getByText(SEED_ERROR_MANUAL_TITLE)).toBeVisible();

    // AntD Select 筛选交互：combobox 打开下拉后点 option
    await page.getByRole('combobox').nth(0).click();
    await page.locator('.ant-select-item-option', { hasText: '维护指南' }).click();

    await expect(page.getByText(SEED_MAINTENANCE_GUIDE_TITLE)).toBeVisible();
    await expect(page.getByText(SEED_ERROR_MANUAL_TITLE)).toHaveCount(0);
    await expect(page.getByText(SEED_SAFETY_STANDARD_TITLE)).toHaveCount(0);

    // 清空筛选恢复全量（AntD allowClear 的清除按钮需 hover 后出现）
    await page.getByRole('combobox').nth(0).hover();
    await page.locator('.ant-select-clear').click();
    await expect(page.getByText(SEED_ERROR_MANUAL_TITLE)).toBeVisible();
    await expect(page.getByText(SEED_SAFETY_STANDARD_TITLE)).toBeVisible();
  });

  // T-03/T-04 工程师只读：列表与详情可达（读权限），无新增/编辑/删除入口；
  // 新增页被角色拒绝清单拦截（避免「能进页面但提交必被拒」的残缺中间态）
  test('engineer can read list and detail but has no write entry', async ({ page }) => {
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_engineer_chen');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/engineer$/);

    await page.goto(LIST_PATH);
    await expect(page.getByText(SEED_ERROR_MANUAL_TITLE)).toBeVisible();
    await expect(page.getByRole('button', { name: '新增资料' })).toHaveCount(0);

    // 详情只读：完整内容可见，无编辑/删除入口
    await page.getByText(SEED_MAINTENANCE_GUIDE_TITLE).click();
    await expect(page.getByRole('heading', { name: '参考资料详情' })).toBeVisible();
    await expect(page.getByText(SEED_MAINTENANCE_GUIDE_TITLE).first()).toBeVisible();
    await expect(page.getByText(/E-LASER-207/)).toBeVisible();
    await expect(page.getByRole('button', { name: /编\s*辑/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '删 除' })).toHaveCount(0);

    // 新增页被拒绝清单拦截，安全跳转回工程师主页
    await page.goto(NEW_PAGE_PATH);
    await expect(page).toHaveURL(/\/engineer$/);
  });

  // T-04 角色矩阵：客户页面被安全跳转回个人主页、导航无入口；
  // 越权直调 GraphQL 读/写均被后端 FORBIDDEN 拒绝（seed 行只读，无污染）
  test('customer is redirected away and blocked from graphql read and write', async ({ page }) => {
    const env = readBackendEnv();

    await page.goto('/login');
    await page.getByLabel('账号或邮箱').fill('mock_customer_alpha');
    await page.getByLabel('密码').fill(env.MOCK_SEED_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/customer$/);

    // 导航无「参考资料库」入口（F-09 角色过滤）
    await expect(page.getByText('参考资料库')).toHaveCount(0);

    // 页面访问被角色根路径表拦截，安全跳转回个人主页
    await page.goto(LIST_PATH);
    await expect(page).toHaveURL(/\/customer$/);

    // 越权直调读接口 → FORBIDDEN
    const readDenied = await realGraphqlCall(
      env,
      LIST_DOCUMENTS_QUERY,
      { pagination: { mode: 'OFFSET', page: 1, pageSize: 10, withTotal: true } },
      'mock_customer_alpha',
    );
    const readErrors = (readDenied.body as { errors?: Array<{ extensions?: { code?: string } }> })
      .errors;
    expect(readErrors?.[0]?.extensions?.code).toBe('FORBIDDEN');

    // 越权直调写接口 → FORBIDDEN（自建行不会落库）
    const writeDenied = await realGraphqlCall(
      env,
      `mutation CreateReferenceDocument($input: CreateReferenceDocumentInput!) {
        createReferenceDocument(input: $input) { id }
      }`,
      {
        input: {
          title: `${E2E_TITLE_PREFIX}（客户越权探测）`,
          documentType: 'CHECKLIST',
          equipmentModelId: null,
          description: null,
          contentText: '越权探测正文',
        },
      },
      'mock_customer_alpha',
    );
    const writeErrors = (writeDenied.body as { errors?: Array<{ extensions?: { code?: string } }> })
      .errors;
    expect(writeErrors?.[0]?.extensions?.code).toBe('FORBIDDEN');

    // 越权写确实未落库（列表中无该行）
    expect(await findE2EDocumentId(env)).toBeNull();
  });
});
