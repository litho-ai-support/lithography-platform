// src/app/layout/entry-accent-glyph.tsx

import { StarFilled } from '@ant-design/icons';

type EntryAccentGlyphProps = {
  inverse?: boolean;
};

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
