// src/pages/admin-users/index.spec.tsx
// @vitest-environment jsdom

/**
 * 用户管理页装配层单测：页面只负责页头与 feature 公开面板的组合。
 *
 * 本轮介绍文案精简为「查看和管理平台账号、基本资料与账号状态。」，删去「角色在创建时选择，
 * 创建后只读」半句；角色的选择时机与创建后只读规则本身不变，只是不再写进页面简介。
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/admin-user-management', () => ({
  AdminUserManagementPanel: () => <div data-testid="admin-user-management-panel" />,
}));

import { AdminUsersPage } from './index';

describe('AdminUsersPage', () => {
  it('渲染精简后的页头文案并组合 feature 公开的用户管理面板', () => {
    render(<AdminUsersPage />);

    expect(screen.getByText('用户管理')).toBeInTheDocument();
    expect(screen.getByText('查看和管理平台账号、基本资料与账号状态。')).toBeInTheDocument();
    expect(screen.queryByText(/角色在创建时选择/)).not.toBeInTheDocument();
    expect(screen.getByTestId('admin-user-management-panel')).toBeInTheDocument();
  });
});
