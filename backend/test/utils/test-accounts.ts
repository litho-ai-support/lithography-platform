// test/utils/test-accounts.ts
import { AccountStatus, IdentityTypeEnum } from '@app-types/models/account.types';
import { Gender, UserState } from '@app-types/models/user-info.types';
import { AccountEntity } from '@src/modules/account/base/entities/account.entity';
import { UserInfoEntity } from '@src/modules/account/base/entities/user-info.entity';
import { AccountService } from '@src/modules/account/base/services/account.service';
import { CreateAccountUsecase } from '@usecases/account/create-account.usecase';
import { DataSource } from 'typeorm';

export interface TestAccountConfig {
  loginName: string;
  loginEmail: string;
  loginPassword: string;
  status: AccountStatus;
  accessGroup: IdentityTypeEnum[];
  identityType: IdentityTypeEnum;
}

export const testAccountsConfig = {
  staff: {
    loginName: 'teststaff',
    loginEmail: 'staff@example.com',
    loginPassword: 'testStaff@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.STAFF],
    identityType: IdentityTypeEnum.STAFF,
  },
  staffPrimary: {
    loginName: 'teststaffprimary',
    loginEmail: 'staff.primary@example.com',
    loginPassword: 'testStaffPrimary@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.STAFF],
    identityType: IdentityTypeEnum.STAFF,
  },
  staffSecondary: {
    loginName: 'teststaffsecondary',
    loginEmail: 'staff.secondary@example.com',
    loginPassword: 'testStaffSecondary@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.STAFF],
    identityType: IdentityTypeEnum.STAFF,
  },
  admin: {
    loginName: 'testadmin',
    loginEmail: 'admin@example.com',
    loginPassword: 'testAdmin@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.ADMIN, IdentityTypeEnum.REGISTRANT],
    // ✅ 修正：与 roles-guard.e2e-spec.ts 保持一致，使用 REGISTRANT
    identityType: IdentityTypeEnum.REGISTRANT,
  },
  guestPrimary: {
    loginName: 'testguestprimary',
    loginEmail: 'guest.primary@example.com',
    loginPassword: 'testGuestPrimary@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.GUEST],
    identityType: IdentityTypeEnum.GUEST,
  },
  guestSecondary: {
    loginName: 'testguestsecondary',
    loginEmail: 'guest.secondary@example.com',
    loginPassword: 'testGuestSecondary@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.GUEST],
    identityType: IdentityTypeEnum.GUEST,
  },
  guest: {
    loginName: 'testguest',
    loginEmail: 'guest@example.com',
    loginPassword: 'testGuest@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.GUEST, IdentityTypeEnum.REGISTRANT],
    identityType: IdentityTypeEnum.REGISTRANT,
  },
  emptyRoles: {
    loginName: 'testempty',
    loginEmail: 'empty@example.com',
    loginPassword: 'testEmpty@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [], // 空数组，符合测试期望
    identityType: IdentityTypeEnum.REGISTRANT,
  },
  staffGuest: {
    loginName: 'teststaffguest',
    loginEmail: 'staff.guest@example.com',
    loginPassword: 'testStaffGuest@2024',
    status: AccountStatus.ACTIVE,
    accessGroup: [IdentityTypeEnum.STAFF, IdentityTypeEnum.GUEST],
    identityType: IdentityTypeEnum.STAFF,
  },
} satisfies Record<string, TestAccountConfig>;

export type TestAccountKey = keyof typeof testAccountsConfig;

/**
 * 清理所有与测试账号相关的数据
 * （按外键方向：先 user_info → account）
 */
export const cleanupTestAccounts = async (dataSource: DataSource): Promise<void> => {
  await dataSource.createQueryBuilder().delete().from(UserInfoEntity).execute();
  await dataSource.createQueryBuilder().delete().from(AccountEntity).execute();
};

/**
 * 造数入口（优先用 Usecase；无 Usecase 时走 repo 回落）
 * - 不写 metaDigest，交由系统内部一致性逻辑生成
 * - 只创建通用账号与 user_info，不创建业务身份 profile
 */
export const seedTestAccounts = async (opts: {
  dataSource: DataSource;
  createAccountUsecase?: CreateAccountUsecase | null;
  // 可选：显式指定要创建哪些 key，不传则全量
  includeKeys?: TestAccountKey[];
}): Promise<void> => {
  const { dataSource, createAccountUsecase, includeKeys } = opts;
  const list = includeKeys ?? (Object.keys(testAccountsConfig) as TestAccountKey[]);

  await Promise.all(
    list.map(async (key) => {
      const cfg = testAccountsConfig[key];
      await createAccountCore(dataSource, createAccountUsecase || null, cfg);
    }),
  );
};

/**
 * 创建账号的核心逻辑（可被复用）
 * @returns 创建的账号ID
 */
const createAccountCore = async (
  dataSource: DataSource,
  createAccountUsecase: CreateAccountUsecase | null,
  cfg: TestAccountConfig,
): Promise<{ accountId: number }> => {
  if (createAccountUsecase) {
    const created = await createAccountUsecase.execute({
      accountData: {
        loginName: cfg.loginName,
        loginEmail: cfg.loginEmail,
        loginPassword: cfg.loginPassword,
        status: cfg.status,
        identityHint: cfg.identityType,
      },
      userInfoData: {
        nickname: `${cfg.loginName}_nickname`,
        gender: Gender.SECRET,
        birthDate: null,
        avatarUrl: null,
        email: cfg.loginEmail,
        signature: null,
        accessGroup: cfg.accessGroup,
        address: null,
        phone: null,
        tags: null,
        geographic: null,
        metaDigest: cfg.accessGroup,
        notifyCount: 0,
        unreadCount: 0,
        userState: UserState.ACTIVE,
      },
    });
    return { accountId: created.id };
  }

  // 回落路径：不依赖 Usecase（直接 repo）
  const accountRepo = dataSource.getRepository(AccountEntity);
  const userInfoRepo = dataSource.getRepository(UserInfoEntity);

  // 1) 先插入占位账号，拿到 createdAt
  const temp = await accountRepo.save(
    accountRepo.create({
      loginName: cfg.loginName,
      loginEmail: cfg.loginEmail,
      loginPassword: 'temp', // 占位
      status: cfg.status,
      identityHint: cfg.identityType,
    }),
  );
  // 2) 根据 createdAt 计算散列并回写
  const hashed = AccountService.hashPasswordWithTimestamp(cfg.loginPassword, temp.createdAt);
  await accountRepo.update(temp.id, { loginPassword: hashed });

  // 3) 写 user_info（设置 metaDigest 与 accessGroup 保持一致）
  await userInfoRepo.save(
    userInfoRepo.create({
      accountId: temp.id,
      nickname: `${cfg.loginName}_nickname`,
      gender: Gender.SECRET,
      email: cfg.loginEmail,
      accessGroup: cfg.accessGroup,
      // ✅ 设置 metaDigest 与 accessGroup 保持一致，避免安全检查失败
      metaDigest: cfg.accessGroup,
      notifyCount: 0,
      unreadCount: 0,
      userState: UserState.ACTIVE,
    }),
  );

  return { accountId: temp.id };
};
