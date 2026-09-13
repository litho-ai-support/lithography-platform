// src/app/navigation/catalog.ts

import type { AuthSessionRole } from '@/features/auth-session';

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
  {
    description: '查阅光刻机维护知识库：错误代码手册、维护指南、安全规范与检查表。',
    id: 'reference-documents',
    kind: 'stable',
    label: '参考资料库',
    // 与 auth-session 角色路径表同口径：工程师/管理员可读，客户禁入不可见
    path: '/reference-documents',
    roles: ['ENGINEER', 'SUPER_ADMIN'],
    tags: ['reference', 'documents', 'knowledge', 'manual', '参考资料', '知识库', '手册'],
  },
  {
    description: 'SUPER_ADMIN 的用户管理页面。',
    id: 'admin-users',
    kind: 'stable',
    label: 'Users',
    // 仅对 SUPER_ADMIN 展示；ENGINEER / CUSTOMER 与未登录用户不显示管理员导航入口。
    // 展示过滤不替代路由守卫：未授权角色直达 /admin/users 仍由路由层拒绝。
    path: '/admin/users',
    roles: ['SUPER_ADMIN'],
    tags: ['admin', 'users', 'management', '管理员', '用户管理'],
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

/**
 * 导航目录出口：环境暴露 + 角色可见性统一过滤。
 * activeRole 为会话活动角色；匿名（null）只见无 roles 限制的入口。
 */
export function getNavigationItems(
  env: AppEnv = getAppEnv(),
  activeRole: AuthSessionRole | null = null,
): NavigationItem[] {
  const environmentItems = [
    ...STABLE_NAVIGATION_ITEMS,
    ...(canExposeLabs(env) ? LAB_NAVIGATION_ITEMS : []),
    ...(canExposeSandbox(env) ? SANDBOX_NAVIGATION_ITEMS : []),
    ...SUPPORT_NAVIGATION_ITEMS,
  ];

  return environmentItems.filter(
    (item) => item.roles === undefined || (activeRole !== null && item.roles.includes(activeRole)),
  );
}
