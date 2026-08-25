// src/app/navigation/catalog.ts

import { type AppEnv, getAppEnv } from '@/shared/env';

import type { NavigationItem } from './types';

const STABLE_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    description: '面向 AI 辅助开发的主工作台。',
    id: 'home',
    kind: 'stable',
    label: 'Workspace',
    path: '/',
    tags: ['home', 'workbench', 'aigc', 'assistant', 'dashboard', '工作台', '助手'],
  },
];

const LAB_NAVIGATION_ITEMS: NavigationItem[] = [
  {
    description: '受控开放的 2048 交互实验。',
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

function canExposeLabs(env: AppEnv) {
  return env === 'dev' || env === 'test';
}

function canExposeSandbox(env: AppEnv) {
  return env === 'dev' || env === 'test';
}

export function getNavigationItems(env = getAppEnv()): NavigationItem[] {
  return [
    ...STABLE_NAVIGATION_ITEMS,
    ...(canExposeLabs(env) ? LAB_NAVIGATION_ITEMS : []),
    ...(canExposeSandbox(env) ? SANDBOX_NAVIGATION_ITEMS : []),
    ...SUPPORT_NAVIGATION_ITEMS,
  ];
}
