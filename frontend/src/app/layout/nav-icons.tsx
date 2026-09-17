// src/app/layout/nav-icons.tsx

import type { ReactNode } from 'react';

// 导航描边图标（计划表 S2-2）：路径逐字取自 gkj.html 原型导航，
// 统一规范为 16×16 渲染（CSS .nav-icon 用 rem 随字号档位缩放）、
// viewBox="0 0 24 24"、stroke-width 2、round linecap/linejoin、currentColor。
// 仅供导航消费；业务页图标仍走 @ant-design/icons。

type NavIconDefinition = {
  id: string;
  path: string;
};

const NAV_ICON_DEFINITIONS: Record<string, NavIconDefinition> = {
  // 原型 data-view="profile"（User Information）
  user: {
    id: 'user',
    path: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  },
  // 原型 data-view="dashboard"（Equipment Status Dashboard）
  dashboard: {
    id: 'dashboard',
    path: 'M3 13h8V3H3v10zm10 8h8V3h-8v18zm-10 0h8v-6H3v6z',
  },
  // 原型 data-view="knowledge"（LLM Knowledge Base，打开书本）
  bookOpen: {
    id: 'bookOpen',
    path: 'M12 6.253v13M12 6.253C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5s3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18s-3.332.477-4.5 1.253',
  },
  // 原型 data-view="equipment"（Fault Diagnosis LLM，三横线）
  list: {
    id: 'list',
    path: 'M4 6h16M4 12h16M4 18h7',
  },
  // 原型 data-view="remote"（Remote Assistance，对话框）
  chat: {
    id: 'chat',
    path: 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-4l-3 3v-3z',
  },
};

function NavStrokeIcon({ definition }: { definition: NavIconDefinition }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      className="nav-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d={definition.path} />
    </svg>
  );
}

export function NavUserIcon(): ReactNode {
  return <NavStrokeIcon definition={NAV_ICON_DEFINITIONS.user} />;
}

export function NavDashboardIcon(): ReactNode {
  return <NavStrokeIcon definition={NAV_ICON_DEFINITIONS.dashboard} />;
}

export function NavBookOpenIcon(): ReactNode {
  return <NavStrokeIcon definition={NAV_ICON_DEFINITIONS.bookOpen} />;
}

export function NavListIcon(): ReactNode {
  return <NavStrokeIcon definition={NAV_ICON_DEFINITIONS.list} />;
}

export function NavChatIcon(): ReactNode {
  return <NavStrokeIcon definition={NAV_ICON_DEFINITIONS.chat} />;
}
