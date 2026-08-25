// src/app/navigation/types.ts

export type NavigationItemKind = 'stable' | 'labs' | 'sandbox';

export type NavigationItem = {
  description: string;
  id: string;
  kind: NavigationItemKind;
  label: string;
  path: string;
  tags: readonly string[];
};
