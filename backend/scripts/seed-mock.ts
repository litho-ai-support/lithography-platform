// scripts/seed-mock.ts
import 'reflect-metadata';
import 'tsconfig-paths/register';

import databaseConfig from '@src/infrastructure/config/database.config';
import { AccountService } from '@src/modules/account/base/services/account.service';
import * as CryptoJS from 'crypto-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import { createHash } from 'node:crypto';
import * as path from 'path';
import { DataSource, DataSourceOptions, EntityManager } from 'typeorm';

type MysqlDataSourceOptions = Extract<DataSourceOptions, { type: 'mysql' | 'mariadb' }>;
type SeedDataSourceOptions = MysqlDataSourceOptions & { database: string };

interface MysqlConnectionConfig {
  type: 'mysql';
  host: string;
  port: number;
  username?: string;
  password?: string;
  database?: string;
  timezone?: string;
  charset?: string;
  extra?: Record<string, unknown>;
}

interface UpsertDefinition {
  table: string;
  columns: readonly string[];
  updateColumns: readonly string[];
  rows: readonly (readonly unknown[])[];
}

interface EquipmentSeed {
  modelCode: string;
  modelName: string;
  sortOrder: number;
  enabled: boolean;
}

interface MockAccount {
  id: number;
  userInfoId: number;
  loginName: string;
  loginEmail: string;
  nickname: string;
  companyName: string;
  role: 'SUPER_ADMIN' | 'ENGINEER' | 'CUSTOMER';
  phone: string;
  tags: string[];
}

interface FieldEncryptionCodec {
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

const SEED_ID_MIN = 900_000;
const SEED_ID_MAX = 999_999;
const FIXED_CREATED_AT = new Date('2026-01-01T00:00:00.000Z');
const EXPECTED_TABLES = [
  'base_user_account',
  'base_user_info',
  'base_async_task_record',
  'base_third_party_auth',
  'base_verification_record',
  'ai_provider_call_record',
  'ai_workflow_context',
  'equipment_model',
  'repair_request',
  'ai_conversation',
  'ai_message',
  'ai_report',
  'engineer_response',
  'reference_document',
] as const;

const MOCK_ACCOUNTS: readonly MockAccount[] = [
  {
    id: 900_001,
    userInfoId: 901_001,
    loginName: 'mock_super_admin',
    loginEmail: 'super.admin@lithography.mock',
    nickname: '系统管理员',
    companyName: '光刻机智能支持平台',
    role: 'SUPER_ADMIN',
    phone: '13800000001',
    tags: ['平台管理', 'Mock'],
  },
  {
    id: 900_101,
    userInfoId: 901_101,
    loginName: 'mock_engineer_chen',
    loginEmail: 'engineer.chen@lithography.mock',
    nickname: '陈工',
    companyName: '光刻机智能支持平台',
    role: 'ENGINEER',
    phone: '13800000101',
    tags: ['浸没式光刻', '故障诊断', 'Mock'],
  },
  {
    id: 900_102,
    userInfoId: 901_102,
    loginName: 'mock_engineer_li',
    loginEmail: 'engineer.li@lithography.mock',
    nickname: '李工',
    companyName: '光刻机智能支持平台',
    role: 'ENGINEER',
    phone: '13800000102',
    tags: ['EUV', '设备维护', 'Mock'],
  },
  {
    id: 900_201,
    userInfoId: 901_201,
    loginName: 'mock_customer_alpha',
    loginEmail: 'customer.alpha@lithography.mock',
    nickname: '华芯设备主管',
    companyName: '华芯制造有限公司',
    role: 'CUSTOMER',
    phone: '13800000201',
    tags: ['客户', '生产一厂', 'Mock'],
  },
  {
    id: 900_202,
    userInfoId: 901_202,
    loginName: 'mock_customer_beta',
    loginEmail: 'customer.beta@lithography.mock',
    nickname: '晶圆科技值班员',
    companyName: '晶圆科技有限公司',
    role: 'CUSTOMER',
    phone: '13800000202',
    tags: ['客户', '夜班', 'Mock'],
  },
];

const EQUIPMENT_MODELS: readonly EquipmentSeed[] = [
  ['ASML-PAS-5500-100D', 'ASML PAS 5500/100D', 10],
  ['ASML-TWINSCAN-XT-860M', 'ASML TWINSCAN XT:860M', 20],
  ['ASML-TWINSCAN-XT-1460K', 'ASML TWINSCAN XT:1460K', 30],
  ['ASML-TWINSCAN-XT-1900I', 'ASML TWINSCAN XT:1900i', 40],
  ['ASML-TWINSCAN-NXT-1950I', 'ASML TWINSCAN NXT:1950i', 50],
  ['ASML-TWINSCAN-NXT-1980DI', 'ASML TWINSCAN NXT:1980Di', 60],
  ['ASML-TWINSCAN-NXT-2000I', 'ASML TWINSCAN NXT:2000i', 70],
  ['ASML-TWINSCAN-NXE-3400C', 'ASML TWINSCAN NXE:3400C', 80],
  ['ASML-TWINSCAN-NXE-3600D', 'ASML TWINSCAN NXE:3600D', 90],
  ['ASML-TWINSCAN-EXE-5000', 'ASML TWINSCAN EXE:5000', 100],
].map(([modelCode, modelName, sortOrder]) => ({
  modelCode: String(modelCode),
  modelName: String(modelName),
  sortOrder: Number(sortOrder),
  enabled: true,
}));

/** 读取脚本环境变量；脚本入口是受控 wiring，不向业务层泄漏运行时配置。 */
function getSeedEnv(key: string): string | undefined {
  // eslint-disable-next-line local-architecture/no-runtime-config-outside-wiring
  return process.env[key];
}

function loadSeedEnv(): void {
  const configuredEnvFile = getSeedEnv('SEED_DOTENV');
  const candidates = [
    configuredEnvFile ? path.resolve(process.cwd(), configuredEnvFile) : null,
    path.resolve(process.cwd(), 'env/.env.e2e'),
    path.resolve(process.cwd(), 'env/.env.development'),
  ].filter((item): item is string => item !== null);
  const envFile = candidates.find((candidate) => fs.existsSync(candidate));

  if (!envFile) {
    process.stdout.write('未找到 Seed 环境文件，使用当前进程环境变量\n');
    return;
  }

  dotenv.config({ path: envFile, quiet: true });
  process.stdout.write(`已加载 Seed 环境文件: ${envFile}\n`);
}

function buildDataSourceOptions(config: MysqlConnectionConfig): SeedDataSourceOptions {
  if (!config.username || !config.database) {
    throw new Error('数据库配置不完整，至少需要 DB_USER 和 DB_NAME');
  }

  return {
    type: 'mysql',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    timezone: config.timezone,
    charset: config.charset,
    extra: config.extra,
    entities: [],
    logging: false,
    synchronize: false,
    migrationsRun: false,
  };
}

function ensureSafeTarget(databaseName: string): void {
  if (getSeedEnv('NODE_ENV') === 'production') {
    throw new Error('Mock Data 禁止在 production 环境执行');
  }

  const lower = databaseName.toLowerCase();
  const looksSafe = ['test', 'drill', 'dev', 'local'].some((keyword) => lower.includes(keyword));
  if (!looksSafe && getSeedEnv('SEED_ALLOW_NON_TEST_DB') !== 'true') {
    throw new Error(
      `数据库名 ${databaseName} 未包含 test/drill/dev/local，已拒绝执行；确认安全后设置 SEED_ALLOW_NON_TEST_DB=true`,
    );
  }
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z][a-z0-9_]*$/u.test(identifier)) {
    throw new Error(`非法 SQL 标识符: ${identifier}`);
  }
  return `\`${identifier}\``;
}

async function upsertRows(manager: EntityManager, definition: UpsertDefinition): Promise<void> {
  if (definition.rows.length === 0) return;
  const width = definition.columns.length;
  if (definition.rows.some((row) => row.length !== width)) {
    throw new Error(`${definition.table} Seed 行的字段数量不一致`);
  }

  const columns = definition.columns.map(quoteIdentifier).join(', ');
  const rowPlaceholder = `(${definition.columns.map(() => '?').join(', ')})`;
  const placeholders = definition.rows.map(() => rowPlaceholder).join(', ');
  const updates = definition.updateColumns
    .map((column) => `${quoteIdentifier(column)} = VALUES(${quoteIdentifier(column)})`)
    .join(', ');
  const parameters = definition.rows.flatMap((row) => [...row]);

  await manager.query(
    `INSERT INTO ${quoteIdentifier(definition.table)} (${columns}) VALUES ${placeholders} ON DUPLICATE KEY UPDATE ${updates}`,
    parameters,
  );
}

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

function buildFieldEncryptionCodec(): FieldEncryptionCodec {
  const keyText = getSeedEnv('FIELD_ENCRYPTION_KEY');
  const ivText = getSeedEnv('FIELD_ENCRYPTION_IV');
  if (!keyText || keyText.length < 16 || !ivText || ivText.length < 16) {
    throw new Error(
      'FIELD_ENCRYPTION_KEY 和 FIELD_ENCRYPTION_IV 均需至少 16 个字符，且必须与 API 使用的配置一致',
    );
  }
  const key = CryptoJS.lib.WordArray.create(CryptoJS.enc.Utf8.parse(keyText).words, 16);
  const iv = CryptoJS.lib.WordArray.create(CryptoJS.enc.Utf8.parse(ivText).words, 16);
  const options = { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 };
  return {
    encrypt: (plain) => CryptoJS.AES.encrypt(plain, key, options).toString(),
    decrypt: (cipher) => CryptoJS.AES.decrypt(cipher, key, options).toString(CryptoJS.enc.Utf8),
  };
}

function asRecordArray(value: unknown, context: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'object' || item === null)) {
    throw new Error(`${context} 查询结果格式无效`);
  }
  return value as Record<string, unknown>[];
}

function readNumber(row: Record<string, unknown>, key: string): number {
  const value = Number(row[key]);
  if (!Number.isFinite(value)) throw new Error(`字段 ${key} 不是有效数字`);
  return value;
}

function readString(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== 'string') throw new Error(`字段 ${key} 不是字符串`);
  return value;
}

async function assertSchemaReady(manager: EntityManager): Promise<void> {
  const placeholders = EXPECTED_TABLES.map(() => '?').join(', ');
  const result: unknown = await manager.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name IN (${placeholders})`,
    [...EXPECTED_TABLES],
  );
  const existing = new Set(
    asRecordArray(result, 'Schema').map((row) => String(row.table_name ?? row.TABLE_NAME)),
  );
  const missing = EXPECTED_TABLES.filter((table) => !existing.has(table));
  if (missing.length > 0) {
    throw new Error(`数据库尚未完成 Migration，缺少表: ${missing.join(', ')}`);
  }
}

// 大部分行是与表字段一一对应的声明式 Mock 数据，保持同表相邻便于审查。
// eslint-disable-next-line max-lines-per-function
async function seedAccounts(
  manager: EntityManager,
  password: string,
  encryption: FieldEncryptionCodec,
): Promise<void> {
  const passwordHash = AccountService.hashPasswordWithTimestamp(password, FIXED_CREATED_AT);
  await upsertRows(manager, {
    table: 'base_user_account',
    columns: [
      'id',
      'login_name',
      'login_email',
      'login_password',
      'status',
      'recent_login_history',
      'identity_hint',
      'created_at',
      'updated_at',
    ],
    updateColumns: [
      'login_name',
      'login_email',
      'login_password',
      'status',
      'recent_login_history',
      'identity_hint',
      'updated_at',
    ],
    rows: MOCK_ACCOUNTS.map((account) => [
      account.id,
      account.loginName,
      account.loginEmail,
      passwordHash,
      'ACTIVE',
      JSON.stringify([]),
      account.role,
      FIXED_CREATED_AT,
      FIXED_CREATED_AT,
    ]),
  });

  await upsertRows(manager, {
    table: 'base_user_info',
    columns: [
      'id',
      'account_id',
      'nickname',
      'company_name',
      'gender',
      'birth_date',
      'avatar_url',
      'email',
      'signature',
      'access_group',
      'address',
      'phone',
      'tags',
      'geographic',
      'meta_digest',
      'notify_count',
      'unread_count',
      'user_state',
      'created_at',
      'updated_at',
    ],
    updateColumns: [
      'nickname',
      'company_name',
      'email',
      'signature',
      'access_group',
      'address',
      'phone',
      'tags',
      'geographic',
      'meta_digest',
      'notify_count',
      'unread_count',
      'user_state',
      'updated_at',
    ],
    rows: MOCK_ACCOUNTS.map((account) => {
      const roles = [account.role];
      return [
        account.userInfoId,
        account.id,
        account.nickname,
        account.companyName,
        'SECRET',
        null,
        null,
        account.loginEmail,
        '光刻机平台开发 Mock 账号',
        JSON.stringify(roles),
        '上海市浦东新区',
        account.phone,
        JSON.stringify(account.tags),
        JSON.stringify({
          province: { label: '上海', key: '310000' },
          city: { label: '上海', key: '310100' },
        }),
        encryption.encrypt(JSON.stringify(roles)),
        account.role === 'CUSTOMER' ? 2 : 0,
        account.role === 'CUSTOMER' ? 1 : 0,
        'ACTIVE',
        FIXED_CREATED_AT,
        FIXED_CREATED_AT,
      ];
    }),
  });
}

async function seedEquipment(manager: EntityManager): Promise<Map<string, number>> {
  await upsertRows(manager, {
    table: 'equipment_model',
    columns: ['model_code', 'model_name', 'sort_order', 'enabled'],
    updateColumns: ['model_name', 'sort_order', 'enabled'],
    rows: EQUIPMENT_MODELS.map((model) => [
      model.modelCode,
      model.modelName,
      model.sortOrder,
      model.enabled,
    ]),
  });

  const placeholders = EQUIPMENT_MODELS.map(() => '?').join(', ');
  const result: unknown = await manager.query(
    `SELECT id, model_code FROM equipment_model WHERE model_code IN (${placeholders})`,
    EQUIPMENT_MODELS.map((model) => model.modelCode),
  );
  const rows = asRecordArray(result, 'equipment_model');
  const modelIds = new Map(
    rows.map((row) => [readString(row, 'model_code'), readNumber(row, 'id')] as const),
  );
  if (modelIds.size !== EQUIPMENT_MODELS.length) {
    throw new Error(`设备型号不完整：期望 ${EQUIPMENT_MODELS.length} 条，实际 ${modelIds.size} 条`);
  }
  return modelIds;
}

function requireModelId(modelIds: Map<string, number>, code: string): number {
  const id = modelIds.get(code);
  if (id === undefined) throw new Error(`找不到设备型号 ${code}`);
  return id;
}

// eslint-disable-next-line max-lines-per-function
async function seedBusinessTables(
  manager: EntityManager,
  modelIds: Map<string, number>,
): Promise<void> {
  const requests = [
    [
      920_001,
      'MOCK-RR-2026-0001',
      900_201,
      requireModelId(modelIds, 'ASML-TWINSCAN-NXT-1980DI'),
      'E-CHUCK-101',
      '晶圆台吸附压力波动，连续三批次出现对准失败。',
      '## 故障现象\n晶圆台吸附压力波动，批次开始约 20 分钟后对准失败。',
      '2026-01-10 09:15:00.000',
      0,
      null,
      null,
      0,
      null,
    ],
    [
      920_002,
      'MOCK-RR-2026-0002',
      900_202,
      requireModelId(modelIds, 'ASML-TWINSCAN-NXE-3400C'),
      'E-LASER-207',
      '光源能量稳定性超限，曝光剂量重复性下降。',
      '## 故障现象\n光源能量稳定性报警，剂量重复性由 0.18% 上升至 0.42%。',
      '2026-01-11 14:20:00.000',
      1,
      900_101,
      '2026-01-11 14:35:00.000',
      0,
      null,
    ],
    [
      920_003,
      'MOCK-RR-2026-0003',
      900_201,
      requireModelId(modelIds, 'ASML-TWINSCAN-NXT-2000I'),
      'E-STAGE-315',
      '扫描台在高速扫描阶段出现位置跟随误差。',
      '## 故障现象\n高速扫描时 Y 方向位置误差超过阈值。',
      '2026-01-12 08:30:00.000',
      1,
      900_102,
      '2026-01-12 08:50:00.000',
      0,
      null,
    ],
    [
      920_004,
      'MOCK-RR-2026-0004',
      900_202,
      requireModelId(modelIds, 'ASML-TWINSCAN-XT-1900I'),
      'E-TEMP-044',
      '环境温度传感器偶发漂移，客户已撤回重复申请。',
      '## 故障现象\n该申请为重复提交，已由客户撤回。',
      '2026-01-13 10:00:00.000',
      0,
      null,
      null,
      1,
      '2026-01-13 10:10:00.000',
    ],
    [
      920_005,
      'MOCK-RR-2026-0005',
      900_201,
      requireModelId(modelIds, 'ASML-TWINSCAN-EXE-5000'),
      'E-OPTICS-512',
      '照明均匀性偏差，等待工程师接单。',
      '## 故障现象\n照明均匀性测量值逐步偏离基准。',
      '2026-01-14 16:45:00.000',
      0,
      null,
      null,
      0,
      null,
    ],
  ] as const;

  await upsertRows(manager, {
    table: 'repair_request',
    columns: [
      'id',
      'request_no',
      'customer_account_id',
      'equipment_model_id',
      'error_code',
      'fault_description',
      'content_md',
      'created_at',
      'is_accepted',
      'accepted_by_engineer_account_id',
      'accepted_at',
      'deprecated',
      'deleted_at',
    ],
    updateColumns: [
      'customer_account_id',
      'equipment_model_id',
      'error_code',
      'fault_description',
      'content_md',
      'is_accepted',
      'accepted_by_engineer_account_id',
      'accepted_at',
      'deprecated',
      'deleted_at',
    ],
    rows: requests,
  });

  await upsertRows(manager, {
    table: 'ai_conversation',
    columns: [
      'id',
      'request_id',
      'engineer_account_id',
      'status',
      'ai_feedback',
      'created_at',
      'completed_at',
    ],
    updateColumns: ['request_id', 'engineer_account_id', 'status', 'ai_feedback', 'completed_at'],
    rows: [
      [
        930_001,
        920_002,
        900_101,
        'COMPLETED',
        '现场检查确认能量传感器窗口有轻微污染；清洁并重新标定后，剂量重复性恢复至 0.16%。AI 建议有效。',
        '2026-01-11 15:00:00.000',
        '2026-01-11 16:10:00.000',
      ],
      [930_002, 920_003, 900_102, 'ACTIVE', null, '2026-01-12 09:05:00.000', null],
      [
        930_003,
        920_002,
        900_101,
        'COMPLETED',
        '复盘会话确认无需更换模块，保留现有标定结果并观察后续三个批次。',
        '2026-01-11 16:20:00.000',
        '2026-01-11 16:40:00.000',
      ],
    ],
  });

  await upsertRows(manager, {
    table: 'ai_message',
    columns: [
      'id',
      'conversation_id',
      'message_seq',
      'turn_no',
      'role',
      'content_text',
      'created_at',
    ],
    updateColumns: ['turn_no', 'role', 'content_text'],
    rows: [
      [
        940_001,
        930_001,
        1,
        null,
        'SYSTEM',
        '你是光刻机故障诊断助手，请基于错误码和测量数据给出排查建议。',
        '2026-01-11 15:00:00.000',
      ],
      [
        940_002,
        930_001,
        2,
        1,
        'USER',
        'NXE:3400C 报 E-LASER-207，剂量重复性升至 0.42%，先检查什么？',
        '2026-01-11 15:01:00.000',
      ],
      [
        940_003,
        930_001,
        3,
        1,
        'ASSISTANT',
        '建议先核对能量传感器窗口污染、最近一次标定时间及光源脉冲能量趋势。',
        '2026-01-11 15:01:05.000',
      ],
      [
        940_004,
        930_001,
        4,
        2,
        'USER',
        '窗口可见轻微雾状污染，标定在 28 天前完成。',
        '2026-01-11 15:08:00.000',
      ],
      [
        940_005,
        930_001,
        5,
        2,
        'ASSISTANT',
        '优先按维护规程清洁窗口，再做能量传感器零点与增益标定，并复测三个批次。',
        '2026-01-11 15:08:06.000',
      ],
      [
        940_006,
        930_002,
        1,
        null,
        'SYSTEM',
        '你是光刻机扫描台故障诊断助手。',
        '2026-01-12 09:05:00.000',
      ],
      [
        940_007,
        930_002,
        2,
        1,
        'USER',
        'NXT:2000i 高速扫描时 Y 方向位置跟随误差超限。',
        '2026-01-12 09:06:00.000',
      ],
      [
        940_008,
        930_002,
        3,
        1,
        'ASSISTANT',
        '请提供伺服误差趋势、扫描速度和最近一次导轨维护时间。',
        '2026-01-12 09:06:04.000',
      ],
      [
        940_009,
        930_002,
        4,
        null,
        'TOOL',
        '模拟监测数据：峰值误差 18 nm，扫描速度 600 mm/s。',
        '2026-01-12 09:07:00.000',
      ],
      [
        940_010,
        930_002,
        5,
        2,
        'USER',
        '降低到 500 mm/s 后峰值误差为 9 nm。',
        '2026-01-12 09:09:00.000',
      ],
      [
        940_011,
        930_002,
        6,
        2,
        'ASSISTANT',
        '初步判断与高速段伺服参数或机械阻力相关，建议先检查导轨状态并比对伺服增益参数。',
        '2026-01-12 09:09:08.000',
      ],
      [
        940_012,
        930_003,
        1,
        1,
        'USER',
        '清洁标定后连续三个批次均正常，是否还需要换能量传感器？',
        '2026-01-11 16:20:00.000',
      ],
      [
        940_013,
        930_003,
        2,
        1,
        'ASSISTANT',
        '当前证据不支持立即更换。建议记录标定结果并连续观察趋势，若再次漂移再评估传感器寿命。',
        '2026-01-11 16:20:05.000',
      ],
    ],
  });

  await upsertRows(manager, {
    table: 'ai_report',
    columns: [
      'id',
      'request_id',
      'conversation_id',
      'engineer_account_id',
      'report_title',
      'report_type',
      'content_md',
      'created_at',
    ],
    updateColumns: ['report_title', 'content_md'],
    rows: [
      [
        950_001,
        920_002,
        930_001,
        900_101,
        'E-LASER-207 故障诊断报告',
        'FAULT_DIAGNOSIS',
        '# 结论\n能量传感器窗口污染导致读数漂移。\n\n# 建议\n清洁后重新标定并观察三个批次。',
        '2026-01-11 16:12:00.000',
      ],
      [
        950_002,
        920_003,
        930_002,
        900_102,
        '扫描台位置误差阶段性分析',
        'INTERIM_ANALYSIS',
        '# 初步判断\n高速段伺服参数或机械阻力异常，等待进一步现场数据。',
        '2026-01-12 09:15:00.000',
      ],
    ],
  });

  await upsertRows(manager, {
    table: 'engineer_response',
    columns: [
      'id',
      'request_id',
      'engineer_account_id',
      'customer_account_id',
      'resolution_status',
      'response_text',
      'created_at',
    ],
    updateColumns: ['resolution_status', 'response_text'],
    rows: [
      [
        960_001,
        920_002,
        900_101,
        900_202,
        'PENDING',
        '已接单，初步建议暂停高精度批次并保留最近 24 小时能量趋势数据。',
        '2026-01-11 14:40:00.000',
      ],
      [
        960_002,
        920_002,
        900_101,
        900_202,
        'RESOLVED',
        '窗口清洁和重新标定已完成，三个验证批次结果正常，本次申请已解决。',
        '2026-01-11 16:15:00.000',
      ],
      [
        960_003,
        920_003,
        900_102,
        900_201,
        'PENDING',
        '已接单，正在比对高速与低速扫描的伺服误差数据。',
        '2026-01-12 09:00:00.000',
      ],
    ],
  });

  await upsertRows(manager, {
    table: 'reference_document',
    columns: [
      'id',
      'title',
      'document_type',
      'equipment_model_id',
      'description',
      'original_filename',
      'mime_type',
      'content_text',
      'storage_backend',
      'storage_reference',
      'created_by_account_id',
      'deprecated',
      'deleted_at',
      'created_at',
      'updated_at',
    ],
    updateColumns: [
      'title',
      'document_type',
      'equipment_model_id',
      'description',
      'original_filename',
      'mime_type',
      'content_text',
      'storage_backend',
      'storage_reference',
      'deprecated',
      'deleted_at',
      'updated_at',
    ],
    rows: [
      [
        970_001,
        'NXT:1980Di 常见错误代码手册（Mock）',
        'ERROR_CODE_MANUAL',
        requireModelId(modelIds, 'ASML-TWINSCAN-NXT-1980DI'),
        '用于 AI 检索测试的模拟错误码资料。',
        'nxt-1980di-error-codes-mock.txt',
        'text/plain',
        'E-CHUCK-101：检查真空回路、密封圈与压力传感器。',
        null,
        null,
        900_001,
        0,
        null,
        '2026-01-02 10:00:00.000',
        '2026-01-02 10:00:00.000',
      ],
      [
        970_002,
        'NXE:3400C 光源维护指南（Mock）',
        'MAINTENANCE_GUIDE',
        requireModelId(modelIds, 'ASML-TWINSCAN-NXE-3400C'),
        '模拟光源维护资料，仅供开发环境使用。',
        'nxe-3400c-source-guide-mock.pdf',
        'application/pdf',
        'E-LASER-207：先检查能量传感器窗口和标定记录。',
        'LOCAL',
        'mock/reference/nxe-3400c-source-guide.pdf',
        900_101,
        0,
        null,
        '2026-01-03 10:00:00.000',
        '2026-01-03 10:00:00.000',
      ],
      [
        970_003,
        '光刻机故障诊断安全规范（Mock）',
        'SAFETY_STANDARD',
        null,
        '适用于所有设备型号的模拟安全提示。',
        'safety-standard-mock.md',
        'text/markdown',
        '执行任何现场操作前必须完成停机确认、权限核验与风险评估。',
        null,
        null,
        900_001,
        0,
        null,
        '2026-01-04 10:00:00.000',
        '2026-01-04 10:00:00.000',
      ],
      [
        970_004,
        '旧版 XT 系列检查表（已停用 Mock）',
        'CHECKLIST',
        requireModelId(modelIds, 'ASML-TWINSCAN-XT-1900I'),
        '用于验证资料软删除过滤。',
        'xt-checklist-old-mock.txt',
        'text/plain',
        '旧版检查表内容。',
        null,
        null,
        900_102,
        1,
        '2026-01-06 10:00:00.000',
        '2026-01-05 10:00:00.000',
        '2026-01-06 10:00:00.000',
      ],
    ],
  });
}

// eslint-disable-next-line max-lines-per-function
async function seedInfrastructureTables(manager: EntityManager): Promise<void> {
  await upsertRows(manager, {
    table: 'base_third_party_auth',
    columns: [
      'id',
      'account_id',
      'provider',
      'provider_user_id',
      'union_id',
      'access_token',
      'created_at',
      'updated_at',
    ],
    updateColumns: ['account_id', 'union_id', 'access_token', 'updated_at'],
    rows: [
      [
        980_001,
        900_201,
        'WEAPP',
        'mock-weapp-openid-customer-alpha',
        'mock-weapp-union-customer-alpha',
        null,
        FIXED_CREATED_AT,
        FIXED_CREATED_AT,
      ],
      [
        980_002,
        900_101,
        'GITHUB',
        'mock-github-engineer-chen',
        null,
        null,
        FIXED_CREATED_AT,
        FIXED_CREATED_AT,
      ],
    ],
  });

  await upsertRows(manager, {
    table: 'base_verification_record',
    columns: [
      'id',
      'type',
      'token_fp',
      'status',
      'expires_at',
      'not_before',
      'target_account_id',
      'subject_type',
      'subject_id',
      'payload',
      'issued_by_account_id',
      'consumed_by_account_id',
      'consumed_at',
      'created_at',
      'updated_at',
    ],
    updateColumns: [
      'status',
      'expires_at',
      'payload',
      'consumed_by_account_id',
      'consumed_at',
      'updated_at',
    ],
    rows: [
      [
        981_001,
        'EMAIL_VERIFY_LINK',
        sha256('mock-email-verification-consumed'),
        'CONSUMED',
        '2026-01-02 00:00:00',
        '2026-01-01 08:00:00',
        900_201,
        'ACCOUNT',
        900_201,
        JSON.stringify({ email: 'customer.alpha@lithography.mock', mock: true }),
        900_001,
        900_201,
        '2026-01-01 09:00:00.000',
        FIXED_CREATED_AT,
        FIXED_CREATED_AT,
      ],
      [
        981_002,
        'PASSWORD_RESET',
        sha256('mock-password-reset-expired'),
        'EXPIRED',
        '2026-01-02 00:00:00',
        null,
        900_202,
        'ACCOUNT',
        900_202,
        JSON.stringify({ mock: true }),
        900_001,
        null,
        null,
        FIXED_CREATED_AT,
        FIXED_CREATED_AT,
      ],
    ],
  });

  await upsertRows(manager, {
    table: 'base_async_task_record',
    columns: [
      'id',
      'queue_name',
      'job_name',
      'job_id',
      'trace_id',
      'actor_account_id',
      'actor_active_role',
      'biz_type',
      'biz_key',
      'biz_sub_key',
      'source',
      'reason',
      'occurred_at',
      'dedup_key',
      'status',
      'attempt_count',
      'max_attempts',
      'enqueued_at',
      'started_at',
      'finished_at',
      'created_at',
      'updated_at',
    ],
    updateColumns: ['status', 'attempt_count', 'started_at', 'finished_at', 'updated_at'],
    rows: [
      [
        982_001,
        'ai-diagnosis',
        'generate-diagnosis',
        'mock-ai-job-001',
        'mock-trace-ai-001',
        900_101,
        'ENGINEER',
        'repair_request',
        '920002',
        '930001',
        'user_action',
        'AI_FAULT_DIAGNOSIS',
        '2026-01-11 15:00:00.000',
        'mock:diagnosis:930001',
        'succeeded',
        1,
        3,
        '2026-01-11 15:00:01.000',
        '2026-01-11 15:00:02.000',
        '2026-01-11 15:00:08.000',
        '2026-01-11 15:00:01.000',
        '2026-01-11 15:00:08.000',
      ],
      [
        982_002,
        'ai-diagnosis',
        'generate-diagnosis',
        'mock-ai-job-002',
        'mock-trace-ai-002',
        900_102,
        'ENGINEER',
        'repair_request',
        '920003',
        '930002',
        'user_action',
        'AI_FAULT_DIAGNOSIS',
        '2026-01-12 09:05:00.000',
        'mock:diagnosis:930002',
        'processing',
        1,
        3,
        '2026-01-12 09:05:01.000',
        '2026-01-12 09:05:02.000',
        null,
        '2026-01-12 09:05:01.000',
        '2026-01-12 09:05:02.000',
      ],
    ],
  });

  await upsertRows(manager, {
    table: 'ai_provider_call_record',
    columns: [
      'id',
      'async_task_record_id',
      'trace_id',
      'call_seq',
      'account_id',
      'nickname_snapshot',
      'biz_type',
      'biz_key',
      'biz_sub_key',
      'source',
      'provider',
      'model',
      'task_type',
      'provider_request_id',
      'provider_status',
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'cost_amount',
      'cost_currency',
      'normalized_error_code',
      'provider_error_code',
      'error_message',
      'provider_started_at',
      'provider_finished_at',
      'provider_latency_ms',
      'created_at',
      'updated_at',
    ],
    updateColumns: [
      'provider_status',
      'prompt_tokens',
      'completion_tokens',
      'total_tokens',
      'cost_amount',
      'cost_currency',
      'normalized_error_code',
      'provider_error_code',
      'error_message',
      'provider_finished_at',
      'provider_latency_ms',
      'updated_at',
    ],
    rows: [
      [
        983_001,
        982_001,
        'mock-trace-ai-001',
        1,
        900_101,
        '陈工',
        'repair_request',
        '920002',
        '930001',
        'user_action',
        'mock',
        'lithography-diagnosis-mock',
        'generate',
        'mock-provider-request-001',
        'succeeded',
        580,
        210,
        790,
        '0.00000000',
        'CNY',
        null,
        null,
        null,
        '2026-01-11 15:00:02.000',
        '2026-01-11 15:00:08.000',
        6000,
        '2026-01-11 15:00:02.000',
        '2026-01-11 15:00:08.000',
      ],
      [
        983_002,
        982_002,
        'mock-trace-ai-002',
        1,
        900_102,
        '李工',
        'repair_request',
        '920003',
        '930002',
        'user_action',
        'mock',
        'lithography-diagnosis-mock',
        'generate',
        'mock-provider-request-002',
        'succeeded',
        430,
        165,
        595,
        '0.00000000',
        'CNY',
        null,
        null,
        null,
        '2026-01-12 09:05:02.000',
        '2026-01-12 09:05:07.000',
        5000,
        '2026-01-12 09:05:02.000',
        '2026-01-12 09:05:07.000',
      ],
      [
        983_003,
        null,
        'mock-trace-ai-003',
        1,
        900_101,
        '陈工',
        'reference_document',
        '970002',
        null,
        'admin_action',
        'mock',
        'lithography-embedding-mock',
        'embed',
        'mock-provider-request-003',
        'failed',
        null,
        null,
        null,
        null,
        null,
        'MOCK_PROVIDER_TIMEOUT',
        'TIMEOUT',
        '模拟超时，用于错误状态页面测试',
        '2026-01-03 11:00:00.000',
        '2026-01-03 11:00:30.000',
        30000,
        '2026-01-03 11:00:00.000',
        '2026-01-03 11:00:30.000',
      ],
    ],
  });

  await upsertRows(manager, {
    table: 'ai_workflow_context',
    columns: [
      'workflow_id',
      'workflow_type',
      'workflow_dedup_hash',
      'workflow_dedup_active_hash',
      'trace_id',
      'queue_name',
      'job_name',
      'job_id',
      'async_task_record_id',
      'biz_type',
      'biz_key',
      'biz_sub_key',
      'source',
      'actor_account_id',
      'actor_active_role',
      'provider',
      'model',
      'status',
      'input_payload_json',
      'output_payload_json',
      'admission_attempt_count',
      'next_enqueue_at',
      'admission_expires_at',
      'admission_reason',
      'error_code',
      'error_message',
      'created_at',
      'updated_at',
    ],
    updateColumns: [
      'async_task_record_id',
      'status',
      'output_payload_json',
      'admission_attempt_count',
      'next_enqueue_at',
      'admission_expires_at',
      'admission_reason',
      'error_code',
      'error_message',
      'updated_at',
    ],
    rows: [
      [
        '00000000-0000-4000-8000-000000000001',
        'FAULT_DIAGNOSIS',
        sha256('mock:diagnosis:930001'),
        null,
        'mock-trace-ai-001',
        'ai-diagnosis',
        'generate-diagnosis',
        'mock-ai-job-001',
        982_001,
        'repair_request',
        '920002',
        '930001',
        'user_action',
        900_101,
        'ENGINEER',
        'mock',
        'lithography-diagnosis-mock',
        'SUCCEEDED',
        JSON.stringify({ conversationId: 930001, mock: true }),
        JSON.stringify({ reportId: 950001, mock: true }),
        1,
        null,
        null,
        null,
        null,
        null,
        '2026-01-11 15:00:00.000',
        '2026-01-11 15:00:08.000',
      ],
      [
        '00000000-0000-4000-8000-000000000002',
        'FAULT_DIAGNOSIS',
        sha256('mock:diagnosis:930002'),
        sha256('mock:diagnosis:930002'),
        'mock-trace-ai-002',
        'ai-diagnosis',
        'generate-diagnosis',
        'mock-ai-job-002',
        982_002,
        'repair_request',
        '920003',
        '930002',
        'user_action',
        900_102,
        'ENGINEER',
        'mock',
        'lithography-diagnosis-mock',
        'PROCESSING',
        JSON.stringify({ conversationId: 930002, mock: true }),
        null,
        1,
        null,
        '2026-01-12 10:05:00.000',
        null,
        null,
        null,
        '2026-01-12 09:05:00.000',
        '2026-01-12 09:05:02.000',
      ],
    ],
  });
}

async function assertSeedResult(
  manager: EntityManager,
  password: string,
  encryption: FieldEncryptionCodec,
): Promise<void> {
  const result: unknown = await manager.query(
    `SELECT
       (SELECT COUNT(*) FROM base_user_account WHERE id BETWEEN ? AND ?) AS accounts,
       (SELECT COUNT(*) FROM base_user_info WHERE id BETWEEN ? AND ?) AS user_infos,
       (SELECT COUNT(*) FROM repair_request WHERE id BETWEEN ? AND ?) AS repair_requests,
       (SELECT COUNT(*) FROM ai_conversation WHERE id BETWEEN ? AND ?) AS conversations,
       (SELECT COUNT(*) FROM ai_message WHERE id BETWEEN ? AND ?) AS messages,
       (SELECT COUNT(*) FROM ai_report WHERE id BETWEEN ? AND ?) AS reports,
       (SELECT COUNT(*) FROM engineer_response WHERE id BETWEEN ? AND ?) AS responses,
       (SELECT COUNT(*) FROM reference_document WHERE id BETWEEN ? AND ?) AS documents,
       (SELECT COUNT(*) FROM base_third_party_auth WHERE id BETWEEN ? AND ?) AS third_party_auth,
       (SELECT COUNT(*) FROM base_verification_record WHERE id BETWEEN ? AND ?) AS verification_records,
       (SELECT COUNT(*) FROM base_async_task_record WHERE id BETWEEN ? AND ?) AS async_tasks,
       (SELECT COUNT(*) FROM ai_provider_call_record WHERE id BETWEEN ? AND ?) AS provider_calls,
       (SELECT COUNT(*) FROM ai_workflow_context WHERE workflow_id LIKE '00000000-0000-4000-8000-00000000000%') AS workflows`,
    Array.from({ length: 12 }, () => [SEED_ID_MIN, SEED_ID_MAX]).flat(),
  );
  const row = asRecordArray(result, 'Seed 汇总')[0];
  if (!row) throw new Error('Seed 汇总查询没有返回结果');
  const expected: Record<string, number> = {
    accounts: 5,
    user_infos: 5,
    repair_requests: 5,
    conversations: 3,
    messages: 13,
    reports: 2,
    responses: 3,
    documents: 4,
    third_party_auth: 2,
    verification_records: 2,
    async_tasks: 2,
    provider_calls: 3,
    workflows: 2,
  };
  const mismatches = Object.entries(expected)
    .filter(([key, count]) => readNumber(row, key) !== count)
    .map(([key, count]) => `${key}: 期望 ${count}，实际 ${readNumber(row, key)}`);
  if (mismatches.length > 0) throw new Error(`Seed 数量校验失败：${mismatches.join('；')}`);

  const accountResult: unknown = await manager.query(
    'SELECT login_password, created_at FROM base_user_account WHERE id = ?',
    [MOCK_ACCOUNTS[0]?.id],
  );
  const accountRow = asRecordArray(accountResult, 'Mock 账号')[0];
  if (!accountRow) throw new Error('Mock 管理员账号不存在');
  const createdAtRaw = accountRow.created_at;
  const createdAt = createdAtRaw instanceof Date ? createdAtRaw : new Date(String(createdAtRaw));
  if (
    !AccountService.verifyPassword(password, readString(accountRow, 'login_password'), createdAt)
  ) {
    throw new Error('Mock 账号密码散列校验失败');
  }

  const digestResult: unknown = await manager.query(
    'SELECT meta_digest FROM base_user_info WHERE account_id = ?',
    [MOCK_ACCOUNTS[0]?.id],
  );
  const digestRow = asRecordArray(digestResult, 'Mock 用户信息')[0];
  if (!digestRow) throw new Error('Mock 管理员用户信息不存在');
  const roles: unknown = JSON.parse(encryption.decrypt(readString(digestRow, 'meta_digest')));
  if (!Array.isArray(roles) || roles[0] !== 'SUPER_ADMIN') {
    throw new Error('Mock 账号角色加密字段校验失败');
  }
}

async function seedMockData(): Promise<void> {
  loadSeedEnv();
  const password = getSeedEnv('MOCK_SEED_PASSWORD');
  if (!password) {
    throw new Error(
      '缺少 MOCK_SEED_PASSWORD；请在 Seed 环境文件或当前进程中设置统一 Mock 登录密码',
    );
  }

  const mysql = (databaseConfig() as { mysql: MysqlConnectionConfig }).mysql;
  const options = buildDataSourceOptions(mysql);
  ensureSafeTarget(options.database);
  const encryption = buildFieldEncryptionCodec();
  const dataSource = new DataSource(options);

  try {
    await dataSource.initialize();
    await dataSource.transaction(async (manager) => {
      await assertSchemaReady(manager);
      await seedAccounts(manager, password, encryption);
      const modelIds = await seedEquipment(manager);
      await seedBusinessTables(manager, modelIds);
      await seedInfrastructureTables(manager);
      await assertSeedResult(manager, password, encryption);
    });
    process.stdout.write(
      `全量 Mock Data 导入成功：${EXPECTED_TABLES.length} 张表均已填充；Mock 主键保留区间 ${SEED_ID_MIN}-${SEED_ID_MAX}；可重复执行\n`,
    );
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void seedMockData().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '未知错误';
  process.stderr.write(`全量 Mock Data 导入失败：${message}\n`);
  process.exit(1);
});
