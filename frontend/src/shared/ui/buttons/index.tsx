// src/shared/ui/buttons/index.tsx

import type { ButtonProps } from 'antd';
import { Button } from 'antd';

// 主/次/危险按钮的公共出口：锁定 antd 语义变体组合，页面不自行拼装 type/danger，
// 保证全站按钮语义与视觉一致。样式交由 antd 主题 Token（colorPrimary 等）驱动。
export function PrimaryButton(props: ButtonProps) {
  return <Button type="primary" {...props} />;
}

export function SecondaryButton(props: ButtonProps) {
  return <Button {...props} />;
}

export function DangerButton(props: ButtonProps) {
  return <Button danger type="primary" {...props} />;
}
