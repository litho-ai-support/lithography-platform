// test/10-admin-document-database/admin-document-database-fixture.ts
// PR3 负责人 review #1（R1）测试专用 helper：夹具标识 + 自保护清理 + 收尾生命周期。
//
// 抽出的动机：让「白名单守卫拒绝后不得执行任何 DELETE」「DataSource 尚未装配时不得
// 触发二次 undefined 错误」等失败路径脱离真实库即可回归（见同目录
// admin-document-database-cleanup-failure.e2e-spec.ts）；守卫语义本身保持真实
// （e2e-db-guard），测试只替换 DataSource，不 mock 被测守卫。

import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AiConversationEntity } from '@src/modules/lithography/entities/ai-conversation.entity';
import { AiMessageEntity } from '@src/modules/lithography/entities/ai-message.entity';
import { AiReportEntity } from '@src/modules/lithography/entities/ai-report.entity';
import { EngineerResponseEntity } from '@src/modules/lithography/entities/engineer-response.entity';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { RepairRequestEntity } from '@src/modules/lithography/entities/repair-request.entity';
import { DataSource, In } from 'typeorm';

import { assertDataSourceOnAllowedE2eDatabase } from '../utils/e2e-db-guard';
import { testAccountsConfig } from '../utils/test-accounts';

/** 本用例独占的固定主键/标识（0918 决策 #3：只精确删除这些，禁止整表清理）。 */
export const ADMIN_DOC_FIXTURE_IDS = {
  equipmentModelIds: [51],
  requestIds: [211, 212, 213],
  conversationIds: [301, 302],
  reportIds: [401, 402],
  accountLoginNames: [
    testAccountsConfig.admin.loginName, // testadmin
    testAccountsConfig.staff.loginName, // teststaff
    testAccountsConfig.guestPrimary.loginName, // testguestprimary
  ],
};

/**
 * 精确回收本用例夹具（沿外键 RESTRICT 反向：报告 → 消息 → 回复 → 会话 → 申请 → 型号 → 账号）。
 *
 * 自保护：即使调用方忘记先验证，本函数也会在**第一条 DELETE 之前**复用同一不可跳过的
 * 目标库白名单守卫；守卫拒绝时不会产生任何删除，也不为清账号而删除其他账号。
 */
export const cleanupAdminDocumentFixture = async (ds: DataSource): Promise<void> => {
  await assertDataSourceOnAllowedE2eDatabase(ds);

  const ids = ADMIN_DOC_FIXTURE_IDS;
  await ds.getRepository(AiReportEntity).delete(ids.reportIds);
  await ds.getRepository(AiMessageEntity).delete({ conversationId: In(ids.conversationIds) });
  await ds.getRepository(EngineerResponseEntity).delete({ requestId: In(ids.requestIds) });
  await ds.getRepository(AiConversationEntity).delete(ids.conversationIds);
  await ds.getRepository(RepairRequestEntity).delete(ids.requestIds);
  await ds.getRepository(EquipmentModelEntity).delete(ids.equipmentModelIds);

  // 账号域：先按本用例 loginName 定位 accountId，再 user_info → account
  const accountRepo = ds.getRepository(AccountEntity);
  const accounts = await accountRepo.find({
    where: { loginName: In(ids.accountLoginNames) },
    select: { id: true },
  });
  const accountIds = accounts.map((account) => account.id);
  if (accountIds.length > 0) {
    await ds.getRepository(UserInfoEntity).delete({ accountId: In(accountIds) });
    await accountRepo.delete({ id: In(accountIds) });
  }
};

/** afterAll 收尾所需的窄接口（便于 mock app/dataSource，不引入 Nest 类型耦合）。 */
export type AdminDocFixtureTeardownParams = {
  app?: { close: () => Promise<void> } | null;
  dataSource?: DataSource | null;
  /** 仅当 beforeAll 在「写夹具之前」完成白名单验证并置位，才允许清理。 */
  targetValidated: boolean;
  cleanup: (ds: DataSource) => Promise<void>;
};

/** 纯判定：只有「已验证目标」且「连接仍初始化」时才允许执行清理。 */
export const shouldRunAdminDocFixtureCleanup = (params: {
  dataSource?: DataSource | null;
  targetValidated: boolean;
}): boolean => Boolean(params.targetValidated && params.dataSource?.isInitialized);

/**
 * afterAll 收尾：
 * - 守卫拒绝 / 未验证目标 / DataSource 未装配 → 跳过清理，只关闭已创建的 app，
 *   守卫失败场景不会再产生第二个删除错误；
 * - 清理失败仍执行 app.close()（try/finally 语义），且不吞掉清理错误（主错误优先，
 *   关闭错误不覆盖清理错误）。
 */
export const runAdminDocFixtureTeardown = async (
  params: AdminDocFixtureTeardownParams,
): Promise<void> => {
  let cleanupError: Error | undefined;
  let closeError: Error | undefined;

  try {
    if (shouldRunAdminDocFixtureCleanup(params) && params.dataSource) {
      await params.cleanup(params.dataSource);
    }
  } catch (error) {
    cleanupError = error instanceof Error ? error : new Error(String(error));
  } finally {
    if (params.app) {
      try {
        await params.app.close();
      } catch (error) {
        closeError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  // 主错误优先：清理错误先于关闭错误上报，两者都不被吞掉
  if (cleanupError) {
    throw cleanupError;
  }
  if (closeError) {
    throw closeError;
  }
};
