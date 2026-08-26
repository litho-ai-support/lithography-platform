// src/labs/game-2048/meta.ts

export const game2048LabMeta = {
  description: '只在 Lab 暴露的本地 2048 交互实验。',
  name: '2048 Lab',
  owner: 'frontend',
  path: '/labs/game-2048',
  purpose: '受控验证一个本地 2048 交互实验，保持轻量实验形态，不承担正式业务入口职责。',
  reviewAt: '2026-11-26',
  rollback: '移除实验路由并隐藏入口',
} as const;
