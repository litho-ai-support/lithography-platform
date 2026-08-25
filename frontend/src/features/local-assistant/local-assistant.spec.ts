// src/features/local-assistant/local-assistant.spec.ts

import { describe, expect, it } from 'vitest';

import { resolveLocalAssistantQuery } from './index';

const candidates = [
  {
    description: 'AIGC 主工作台',
    id: 'home',
    label: '工作台',
    path: '/',
    tags: ['home', 'aigc', '工作台'],
  },
  {
    description: '2048 交互实验页面',
    id: 'game-2048-lab',
    label: '2048 Lab',
    path: '/labs/game-2048',
    tags: ['2048', 'game', 'lab', '游戏', '实验'],
  },
];

describe('resolveLocalAssistantQuery', () => {
  it('returns matching route suggestions', () => {
    const reply = resolveLocalAssistantQuery('2048', candidates);

    expect(reply.suggestions[0]?.id).toBe('game-2048-lab');
  });
});
