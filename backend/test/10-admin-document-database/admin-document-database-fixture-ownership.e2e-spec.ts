// test/10-admin-document-database/admin-document-database-fixture-ownership.e2e-spec.ts
//
// 第四轮 Review：普通 admin-document-database E2E 夹具的真实隔离库数据安全反例。
// 所有被测 helper 只允许连接 lithography_e2e；外部碰撞数据由本 spec 创建、记录并在逐字段
// 核验后回收，不把固定主键本身当作所有权。

import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { AiConversationStatus, AiMessageRole } from '@app-types/models/ai-conversation.types';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AiConversationEntity } from '@src/modules/lithography/entities/ai-conversation.entity';
import { AiMessageEntity } from '@src/modules/lithography/entities/ai-message.entity';
import { AiReportEntity } from '@src/modules/lithography/entities/ai-report.entity';
import { EquipmentModelEntity } from '@src/modules/lithography/entities/equipment-model.entity';
import { RepairRequestEntity } from '@src/modules/lithography/entities/repair-request.entity';
import { CreateAccountUsecase } from '@src/usecases/account/create-account.usecase';
import { DataSource, In } from 'typeorm';

import { assertDataSourceOnAllowedE2eDatabase } from '../utils/e2e-db-guard';
import { createTestAccount, type TestAccountConfig } from '../utils/test-accounts';
import {
  ADMIN_DOC_FIXTURE_ACCOUNTS,
  ADMIN_DOC_FIXTURE_MARKERS,
  cleanupAdminDocumentFixtureByIds,
  cleanupAdminDocumentFixtureResidue,
  createAdminDocFixtureOwnership,
  seedAdminDocumentFixtureAccounts,
  seedAdminDocumentFixtureBusiness,
  type AdminDocFixtureOwnership,
} from './admin-document-database-fixture';

const LEGACY_IDS = {
  model: 51,
  requests: [211, 212, 213],
  conversations: [301, 302],
  reports: [401, 402],
  message: 501,
} as const;

const FOREIGN = {
  loginName: 'pr3corecollision',
  modelCode: 'E2E-ADM-CORE-FOREIGN-MODEL',
  requestNos: ['E2E-ADM-CORE-FOREIGN-211', 'E2E-ADM-CORE-FOREIGN-212', 'E2E-ADM-CORE-FOREIGN-213'],
  reportTitles: ['E2E-ADM-CORE-FOREIGN-401', 'E2E-ADM-CORE-FOREIGN-402'],
  externalReferenceRequestNo: 'E2E-ADM-CORE-FOREIGN-REF',
} as const;

const FOREIGN_ACCOUNT: TestAccountConfig = {
  loginName: FOREIGN.loginName,
  loginEmail: 'pr3.core.collision@example.com',
  loginPassword: 'Pr3CoreCollision@2024',
  status: AccountStatus.ACTIVE,
  accessGroup: [IdentityTypeEnum.CUSTOMER],
  identityType: IdentityTypeEnum.CUSTOMER,
};

type ForeignChainIds = {
  accountId: number;
  modelId: number;
  requestIds: number[];
  conversationIds: number[];
  messageIds: number[];
  reportIds: number[];
};

describe('普通 admin-document-database fixture 所有权（真实隔离库）', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let createAccountUsecase: CreateAccountUsecase;

  beforeAll(async () => {
    const [{ initGraphQLSchema }, { ApiModule: apiModule }] = await Promise.all([
      import('../../src/adapters/api/graphql/schema/schema.init'),
      import('../../src/bootstraps/api/api.module'),
    ]);
    initGraphQLSchema();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [apiModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    dataSource = moduleFixture.get(DataSource);
    createAccountUsecase = app.get(CreateAccountUsecase);
    await assertDataSourceOnAllowedE2eDatabase(dataSource);
    await cleanupAdminDocumentFixtureResidue(dataSource);
  });

  afterAll(async () => {
    try {
      await cleanupAdminDocumentFixtureResidue(dataSource);
    } finally {
      await app.close();
    }
  });

  const seedFixtureAccounts = async (
    ownership: AdminDocFixtureOwnership,
  ): Promise<{ admin: number; engineer: number; customer: number }> =>
    seedAdminDocumentFixtureAccounts({
      dataSource,
      ownership,
      createAccountUsecase,
    });

  const countFixtureMarkers = async (): Promise<{
    accounts: number;
    models: number;
    requests: number;
  }> => {
    const [accounts, models, requests] = await Promise.all([
      dataSource.getRepository(AccountEntity).count({
        where: {
          loginName: In(Object.values(ADMIN_DOC_FIXTURE_ACCOUNTS).map((row) => row.loginName)),
        },
      }),
      dataSource
        .getRepository(EquipmentModelEntity)
        .count({ where: { modelCode: ADMIN_DOC_FIXTURE_MARKERS.modelCode } }),
      dataSource.getRepository(RepairRequestEntity).count({
        where: {
          requestNo: In([
            ADMIN_DOC_FIXTURE_MARKERS.requestA,
            ADMIN_DOC_FIXTURE_MARKERS.requestDeleted,
            ADMIN_DOC_FIXTURE_MARKERS.requestOlder,
          ]),
        },
      }),
    ]);
    return { accounts, models, requests };
  };

  const readForeignChain = async (ids: ForeignChainIds): Promise<Record<string, unknown>> => {
    const [account, model, requests, conversations, messages, reports] = await Promise.all([
      dataSource.getRepository(AccountEntity).findOne({ where: { id: ids.accountId } }),
      dataSource.getRepository(EquipmentModelEntity).findOne({ where: { id: ids.modelId } }),
      dataSource.getRepository(RepairRequestEntity).find({
        where: { id: In(ids.requestIds) },
        order: { id: 'ASC' },
      }),
      dataSource.getRepository(AiConversationEntity).find({
        where: { id: In(ids.conversationIds) },
        order: { id: 'ASC' },
      }),
      dataSource.getRepository(AiMessageEntity).find({
        where: { id: In(ids.messageIds) },
        order: { id: 'ASC' },
      }),
      dataSource.getRepository(AiReportEntity).find({
        where: { id: In(ids.reportIds) },
        order: { id: 'ASC' },
      }),
    ]);
    return { account, model, requests, conversations, messages, reports };
  };

  const seedLegacyCollisionChain = async (): Promise<ForeignChainIds> => {
    const accountId = (await createTestAccount(dataSource, createAccountUsecase, FOREIGN_ACCOUNT))
      .accountId;
    const modelRepo = dataSource.getRepository(EquipmentModelEntity);
    const requestRepo = dataSource.getRepository(RepairRequestEntity);
    const conversationRepo = dataSource.getRepository(AiConversationEntity);
    const messageRepo = dataSource.getRepository(AiMessageEntity);
    const reportRepo = dataSource.getRepository(AiReportEntity);

    const model = await modelRepo.save(
      modelRepo.create({
        id: LEGACY_IDS.model,
        modelCode: FOREIGN.modelCode,
        modelName: '外部型号：占用普通 spec 历史主键',
        enabled: true,
        sortOrder: 1,
      }),
    );
    const requests = await requestRepo.save(
      LEGACY_IDS.requests.map((id, index) =>
        requestRepo.create({
          id,
          requestNo: FOREIGN.requestNos[index],
          customerAccountId: accountId,
          equipmentModelId: model.id,
          errorCode: `FOREIGN-${id}`,
          faultDescription: `外部申请：占用历史主键 ${id}`,
          contentMd: `# FOREIGN-${id}`,
          createdAt: new Date(`2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`),
          isAccepted: false,
          acceptedByEngineerAccountId: null,
          acceptedAt: null,
          deprecated: false,
          deletedAt: null,
        }),
      ),
    );
    const conversations = await conversationRepo.save([
      conversationRepo.create({
        id: LEGACY_IDS.conversations[0],
        requestId: requests[0].id,
        engineerAccountId: accountId,
        status: AiConversationStatus.COMPLETED,
        aiFeedback: '外部会话反馈',
        completedAt: new Date('2026-07-10T01:00:00.000Z'),
        createdAt: new Date('2026-07-10T00:00:00.000Z'),
      }),
      conversationRepo.create({
        id: LEGACY_IDS.conversations[1],
        requestId: requests[0].id,
        engineerAccountId: accountId,
        status: AiConversationStatus.ACTIVE,
        aiFeedback: null,
        completedAt: null,
        createdAt: new Date('2026-07-11T00:00:00.000Z'),
      }),
    ]);
    const message = await messageRepo.save(
      messageRepo.create({
        id: LEGACY_IDS.message,
        conversationId: conversations[0].id,
        messageSeq: 1,
        turnNo: 1,
        role: AiMessageRole.USER,
        contentText: '外部消息：固定会话 ID 不代表所有权',
        createdAt: new Date('2026-07-10T00:01:00.000Z'),
      }),
    );
    const reports = await reportRepo.save([
      reportRepo.create({
        id: LEGACY_IDS.reports[0],
        requestId: requests[0].id,
        conversationId: conversations[0].id,
        engineerAccountId: accountId,
        reportTitle: FOREIGN.reportTitles[0],
        reportType: 'FOREIGN-A',
        contentMd: '# foreign report 401',
        createdAt: new Date('2026-07-10T02:00:00.000Z'),
      }),
      reportRepo.create({
        id: LEGACY_IDS.reports[1],
        requestId: requests[1].id,
        conversationId: conversations[1].id,
        engineerAccountId: accountId,
        reportTitle: FOREIGN.reportTitles[1],
        reportType: 'FOREIGN-B',
        contentMd: '# foreign report 402',
        createdAt: new Date('2026-07-11T02:00:00.000Z'),
      }),
    ]);
    return {
      accountId,
      modelId: model.id,
      requestIds: requests.map((row) => row.id),
      conversationIds: conversations.map((row) => row.id),
      messageIds: [message.id],
      reportIds: reports.map((row) => row.id),
    };
  };

  const cleanupVerifiedForeignChain = async (
    ids: ForeignChainIds,
    expectedSnapshot: Record<string, unknown>,
  ): Promise<void> => {
    await assertDataSourceOnAllowedE2eDatabase(dataSource);
    const current = await readForeignChain(ids);
    if (JSON.stringify(current) !== JSON.stringify(expectedSnapshot)) {
      throw new Error('外部碰撞链字段已变化，拒绝按记录 ID 清理');
    }
    await dataSource.transaction(async (manager) => {
      await manager.getRepository(AiReportEntity).delete({ id: In(ids.reportIds) });
      await manager.getRepository(AiMessageEntity).delete({ id: In(ids.messageIds) });
      await manager.getRepository(AiConversationEntity).delete({ id: In(ids.conversationIds) });
      await manager.getRepository(RepairRequestEntity).delete({ id: In(ids.requestIds) });
      await manager.getRepository(EquipmentModelEntity).delete({ id: ids.modelId });
      await manager.getRepository(UserInfoEntity).delete({ accountId: ids.accountId });
      await manager.getRepository(AccountEntity).delete({ id: ids.accountId });
    });
  };

  it('历史固定数字 ID 被外部链占用时，普通夹具准备与清理均不改变外部数据', async () => {
    const foreignIds = await seedLegacyCollisionChain();
    const before = await readForeignChain(foreignIds);
    const ownership = createAdminDocFixtureOwnership();

    try {
      const accounts = await seedFixtureAccounts(ownership);
      const business = await seedAdminDocumentFixtureBusiness({
        dataSource,
        ownership,
        customerAccountId: accounts.customer,
        engineerAccountId: accounts.engineer,
      });
      expect(business.equipmentModelId).not.toBe(LEGACY_IDS.model);
      expect(business.requestAId).not.toBe(LEGACY_IDS.requests[0]);
      expect(business.conversationAId).not.toBe(LEGACY_IDS.conversations[0]);
      expect(business.reportAId).not.toBe(LEGACY_IDS.reports[0]);
      expect(await readForeignChain(foreignIds)).toEqual(before);

      await cleanupAdminDocumentFixtureByIds(dataSource, ownership);
      expect(await readForeignChain(foreignIds)).toEqual(before);
    } finally {
      if ((await countFixtureMarkers()).accounts > 0) {
        await cleanupAdminDocumentFixtureByIds(dataSource, ownership);
      }
      await cleanupVerifiedForeignChain(foreignIds, before);
    }
  });

  it('同名异主账号：残留恢复失败关闭，账号字段完全不变', async () => {
    const repo = dataSource.getRepository(AccountEntity);
    const foreign = await repo.save(
      repo.create({
        loginName: ADMIN_DOC_FIXTURE_ACCOUNTS.admin.loginName,
        loginEmail: 'foreign.same-name@example.com',
        loginPassword: 'foreign-not-a-fixture-hash',
        status: AccountStatus.SUSPENDED,
        identityHint: IdentityTypeEnum.ENGINEER,
      }),
    );
    const before = await repo.findOne({ where: { id: foreign.id } });
    try {
      await expect(cleanupAdminDocumentFixtureResidue(dataSource)).rejects.toThrow(/归属校验/);
      expect(await repo.findOne({ where: { id: foreign.id } })).toEqual(before);
    } finally {
      const current = await repo.findOne({ where: { id: foreign.id } });
      if (current?.loginEmail === 'foreign.same-name@example.com') {
        await repo.delete({ id: foreign.id });
      }
    }
  });

  it('同 modelCode 异字段型号：残留恢复失败关闭，型号完全不变', async () => {
    const repo = dataSource.getRepository(EquipmentModelEntity);
    const foreign = await repo.save(
      repo.create({
        modelCode: ADMIN_DOC_FIXTURE_MARKERS.modelCode,
        modelName: '外部同编码型号',
        enabled: false,
        sortOrder: 1,
      }),
    );
    const before = await repo.findOne({ where: { id: foreign.id } });
    try {
      await expect(cleanupAdminDocumentFixtureResidue(dataSource)).rejects.toThrow(/归属校验/);
      expect(await repo.findOne({ where: { id: foreign.id } })).toEqual(before);
    } finally {
      const current = await repo.findOne({ where: { id: foreign.id } });
      if (current?.modelName === '外部同编码型号') {
        await repo.delete({ id: foreign.id });
      }
    }
  });

  it('外部申请引用夹具账号/型号时，清理在任何 DELETE 前失败关闭', async () => {
    const ownership = createAdminDocFixtureOwnership();
    const accounts = await seedFixtureAccounts(ownership);
    const business = await seedAdminDocumentFixtureBusiness({
      dataSource,
      ownership,
      customerAccountId: accounts.customer,
      engineerAccountId: accounts.engineer,
    });
    const requestRepo = dataSource.getRepository(RepairRequestEntity);
    const external = await requestRepo.save(
      requestRepo.create({
        requestNo: FOREIGN.externalReferenceRequestNo,
        customerAccountId: accounts.customer,
        equipmentModelId: business.equipmentModelId,
        errorCode: 'FOREIGN-REFERENCE',
        faultDescription: '外部申请引用普通 spec 的账号和型号',
        contentMd: '# FOREIGN-REFERENCE',
        createdAt: new Date('2026-07-20T00:00:00.000Z'),
        isAccepted: false,
        acceptedByEngineerAccountId: null,
        acceptedAt: null,
        deprecated: false,
        deletedAt: null,
      }),
    );
    const fixtureRequestBefore = await requestRepo.findOne({ where: { id: business.requestAId } });
    const externalBefore = await requestRepo.findOne({ where: { id: external.id } });
    try {
      await expect(cleanupAdminDocumentFixtureByIds(dataSource, ownership)).rejects.toThrow(
        /外部申请/,
      );
      expect(await requestRepo.findOne({ where: { id: business.requestAId } })).toEqual(
        fixtureRequestBefore,
      );
      expect(await requestRepo.findOne({ where: { id: external.id } })).toEqual(externalBefore);
    } finally {
      const current = await requestRepo.findOne({ where: { id: external.id } });
      if (current?.requestNo === FOREIGN.externalReferenceRequestNo) {
        await requestRepo.delete({ id: external.id });
      }
      await cleanupAdminDocumentFixtureByIds(dataSource, ownership);
    }
  });

  it('beforeAll 等价中途失败：只回收已记录成功行，不制造残留', async () => {
    const ownership = createAdminDocFixtureOwnership();
    const accounts = await seedFixtureAccounts(ownership);
    await expect(
      seedAdminDocumentFixtureBusiness({
        dataSource,
        ownership,
        customerAccountId: accounts.customer,
        engineerAccountId: accounts.engineer,
        failurePoint: 'after-conversations',
      }),
    ).rejects.toThrow('after-conversations');

    expect(ownership.equipmentModelIds).toHaveLength(1);
    expect(ownership.repairRequestIds).toHaveLength(3);
    expect(ownership.conversationIds).toHaveLength(2);
    expect(ownership.messageIds).toEqual([]);
    expect(ownership.reportIds).toEqual([]);

    await cleanupAdminDocumentFixtureByIds(dataSource, ownership);
    expect(await countFixtureMarkers()).toEqual({ accounts: 0, models: 0, requests: 0 });
  });

  it('连续两轮不依赖 TRUNCATE：每轮动态主键，清理后均无残留', async () => {
    const generatedIds: number[] = [];
    for (let run = 0; run < 2; run += 1) {
      const ownership = createAdminDocFixtureOwnership();
      const accounts = await seedFixtureAccounts(ownership);
      const business = await seedAdminDocumentFixtureBusiness({
        dataSource,
        ownership,
        customerAccountId: accounts.customer,
        engineerAccountId: accounts.engineer,
      });
      generatedIds.push(business.equipmentModelId, business.requestAId);
      await cleanupAdminDocumentFixtureByIds(dataSource, ownership);
      expect(await countFixtureMarkers()).toEqual({ accounts: 0, models: 0, requests: 0 });
    }
    expect(new Set(generatedIds).size).toBe(generatedIds.length);
  });
});
