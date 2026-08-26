// src/widgets/aigc-sidecar/entry-accent-glyph.tsx

import { StarFilled } from '@ant-design/icons';

type EntryAccentGlyphProps = {
  inverse?: boolean;
};

// AI 入口强调符号的唯一实现；sidecar 标题与 app shell 的 AI 触发按钮都从这里复用，
// app/layout 通过 widgets 公开入口导入（widgets 不能反向依赖 app）。
export function EntryAccentGlyph({ inverse = false }: EntryAccentGlyphProps) {
  return (
    <span
      aria-hidden="true"
      className={`entry-accent-glyph${inverse ? ' entry-accent-glyph-inverse' : ''}`}
    >
      <StarFilled />
    </span>
  );
}
