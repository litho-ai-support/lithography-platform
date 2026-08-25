// test/setup-unit.ts

/**
 * Jest 单元测试的全局测试设置文件
 * 用于配置测试环境和全局模拟
 */

// 设置测试超时时间
jest.setTimeout(10000);

// 模拟环境变量
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_ACCESS_TOKEN_EXPIRES_IN = '1h';
process.env.JWT_REFRESH_TOKEN_EXPIRES_IN = '7d';

/**
 * 模拟 Repository 接口定义
 */
interface MockRepository {
  find: jest.Mock;
  findOne: jest.Mock;
  findOneBy: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  delete: jest.Mock;
  remove: jest.Mock;
  create: jest.Mock;
  createQueryBuilder: jest.Mock;
  count: jest.Mock;
  findAndCount: jest.Mock;
}

// 全局测试工具函数声明
declare global {
  var createMockRepository: () => MockRepository;
}

/**
 * 创建模拟的 Repository 对象
 */
(
  global as typeof globalThis & { createMockRepository: () => MockRepository }
).createMockRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneBy: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  remove: jest.fn(),
  create: jest.fn(),
  createQueryBuilder: jest.fn(),
  count: jest.fn(),
  findAndCount: jest.fn(),
});

// 清理函数
afterEach(() => {
  jest.clearAllMocks();
});

// 导出空对象以使此文件成为模块
export {};
