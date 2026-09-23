// src/app/theme/index.ts

import { type ThemeConfig } from 'antd';

export const APP_THEME_CSS_VAR_KEY = 'app-theme';

// 视觉基准 gkj.html 的 Token 映射来源：docs/plan/薛-PR1-S1现状与设计映射-20260914.md 第 3 节。
// 2026-09-14 裁定：本期收敛为浅色，暗色算法路径移除（后续有需要再恢复）。
// 字体（负责人 0914）：拉丁/数字走本地 Inter，中文回退系统中文字体；等宽区域（编号/代码/
// 文件名）用本地 JetBrains Mono。字体经 @fontsource-variable 本地打包，运行时零字体 CDN。
// 真源约定：FONT_STACK_SANS 是 AntD 侧唯一真源；原生 CSS 侧的 --font-sans/--font-mono
// 在 index.css 维护镜像（CSS 无法读取 TS 常量），两处必须同步修改。等宽字体暂无 TS
// 消费方，故不导出 FONT_STACK_MONO，待出现消费方（如代码块组件）时再引入。
export const FONT_STACK_SANS =
  "'Inter Variable', -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";

type AppThemeConfigInput = {
  fontSize: number;
};

export function createAppThemeConfig({ fontSize }: AppThemeConfigInput): ThemeConfig {
  return {
    cssVar: {
      key: APP_THEME_CSS_VAR_KEY,
    },
    token: {
      // 按钮半径规则（第三轮 Review S2，原型 rounded-lg/rounded-md 实测）：
      // borderRadius = 页面主要动作 8px；borderRadiusSM = 紧凑控件（size=small）6px。
      // 原生 CSS 侧镜像为 index.css 的 --radius-action/--radius-control（CSS 无法读取
      // TS 常量），两处必须同步修改；状态胶囊 999px 走 --radius-pill。
      borderRadius: 8,
      borderRadiusLG: 14,
      borderRadiusSM: 6,
      colorBgLayout: '#f3f4f6',
      colorBorderSecondary: '#e2e8f0',
      colorError: '#dc2626',
      colorErrorBg: '#fee2e2',
      colorPrimary: '#2563eb',
      colorPrimaryActive: '#1d4ed8',
      colorPrimaryBg: '#dbeafe',
      colorSuccess: '#16a34a',
      colorSuccessBg: '#dcfce7',
      colorWarning: '#d97706',
      colorWarningBg: '#fef3c7',
      fontFamily: FONT_STACK_SANS,
      fontSize,
    },
  };
}
