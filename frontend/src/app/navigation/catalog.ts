// src/app/navigation/catalog.ts

import { getAppEnv, isDevOrTestEnv } from '@/shared/env';

import type { NavigationItem } from './types';

const STABLE_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    description: '按登录态自动分发到对应角色的工作台。',
    id: 'home',
    kind: 'stable',
    label: 'Workspace',
    path: '/',
    tags: ['home', 'workbench', 'aigc', 'assistant', 'dashboard', '工作台', '助手'],
  },
];

const LAB_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    // 与 labs/game-2048/meta.ts 的 description 保持一致（app/navigation 不在 labs 导入例外内，需手工同步）
    description: '只在 Lab 暴露的本地 2048 交互实验。',
    id: 'game-2048-lab',
    kind: 'labs',
    label: 'Lab',
    path: '/labs/game-2048',
    tags: ['lab', '2048', 'game', 'experiment', '游戏', '实验'],
  },
];

const SANDBOX_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    description: '用于一次性检查主题 token 的开发试验台。',
    id: 'sandbox-playground',
    kind: 'sandbox',
    label: 'Sandbox',
    path: '/sandbox/playground',
    tags: ['sandbox', 'prototype', 'playground', 'token', 'theme', '沙盒', '主题'],
  },
];

const SUPPORT_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    description: '预览通用路由和运行时错误反馈。',
    id: 'error-preview',
    kind: 'stable',
    label: 'Errors',
    path: '/error-preview',
    tags: ['error', 'feedback', '404', '500', 'route', '错误页', '异常反馈'],
  },
];

export function getNavigationItems(env = getAppEnv()): NavigationItem[] {
  // 环境暴露判断委托 shared/env 的唯一实现，与 labs/sandbox 各自 access.ts 保持一致。
  const canExposeExperimentalEntries = isDevOrTestEnv(env);

  return [
    ...STABLE_NAVIGATION_ITEMS,
    ...(canExposeExperimentalEntries ? LAB_NAVIGATION_ITEMS : []),
    ...(canExposeExperimentalEntries ? SANDBOX_NAVIGATION_ITEMS : []),
    ...SUPPORT_NAVIGATION_ITEMS,
  ];
}
