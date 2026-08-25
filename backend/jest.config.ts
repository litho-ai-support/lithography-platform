// jest.config.ts

import type { Config } from 'jest';

/**
 * Jest 配置文件 - 单元测试专用
 * 基于并替换 nest 默认在 package.json 中的配置，适用于 NestJS TypeScript 项目
 */
const isWatchMode = process.argv.some((arg) => arg === '--watch' || arg === '--watchAll');

const config: Config = {
  // 保留原有配置：测试环境
  testEnvironment: 'node',

  // 根目录设置
  rootDir: './',

  // 模块文件扩展名
  moduleFileExtensions: ['js', 'json', 'ts'],

  // 模块路径映射
  moduleNameMapper: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^@src/(.*)$': '<rootDir>/src/$1',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^src/(.*)$': '<rootDir>/src/$1',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^@interfaces/(.*)$': '<rootDir>/src/interfaces/$1',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^@usecases/(.*)$': '<rootDir>/src/usecases/$1',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^@app-types/(.*)$': '<rootDir>/src/types/$1',
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^@adapters/(.*)$': '<rootDir>/src/adapters/$1',
  },

  // 修改：只匹配单元测试文件，排除 E2E 测试
  testRegex: '.*.spec.ts$',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/test/', // 排除 test 目录下的 E2E 测试
  ],

  // TypeScript 转换
  transform: {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.spec.json',
      },
    ],
  },

  dependencyExtractor: '<rootDir>/test/jest-type-dependency-extractor.js',

  // 覆盖率收集
  collectCoverageFrom: [
    '**/*.(t|j)s',
    // 排除不需要测试覆盖率的文件
    '!**/*.spec.ts',
    '!**/*.e2e-spec.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/test/**', // 排除 test 目录
    '!**/*.interface.ts',
    '!**/*.dto.ts',
    '!**/*.entity.ts',
    '!**/*.enum.ts',
    '!**/*.types.ts',
    '!**/main.ts',
  ],

  // 覆盖率输出目录
  coverageDirectory: '<rootDir>/coverage',

  // 覆盖率报告格式
  coverageReporters: ['text', 'lcov', 'html', 'json'],

  // 覆盖率阈值
  // coverageThreshold: {
  //   global: {
  //     branches: 70,
  //     functions: 70,
  //     lines: 70,
  //     statements: 70,
  //   },
  // },

  // 测试设置文件
  setupFilesAfterEnv: ['<rootDir>/test/setup-unit.ts'],

  // 清除模拟调用和实例
  clearMocks: true,

  // 每次测试后恢复模拟状态
  restoreMocks: true,

  // 测试超时时间（毫秒）
  testTimeout: 10000,

  // 详细输出
  verbose: true,

  // 错误时显示堆栈跟踪
  errorOnDeprecated: true,

  // 检测打开的句柄
  detectOpenHandles: true,

  // 强制退出
  forceExit: true,

  // 最大工作进程数
  maxWorkers: '50%',

  // 预设配置
  preset: 'ts-jest',

  // 删除已弃用的 globals 配置
  // globals: {
  //   'ts-jest': {
  //     tsconfig: 'tsconfig.json',
  //   },
  // },

  // 监听忽略模式
  watchPathIgnorePatterns: ['/node_modules/', '/dist/', '/coverage/', '/test/'],
};

if (isWatchMode) {
  // ts-jest can reuse stale semantic diagnostics for erased type-only imports in watch mode.
  // Keep normal one-shot test runs cached; make watch reloads deterministic.
  config.cache = false;
}

export default config;
