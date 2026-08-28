<!-- docs/navigation.md -->

# Navigation

- Route truth lives in `src/app/router/`：路由树与守卫在 `app.tsx`，公开出口在 `index.ts`，
  React 树外最小程序化导航入口在 `router-bridge.ts`。
- Navigation truth lives in `src/app/navigation/`，只承载声明式菜单目录；程序化导航不属于它。
- Labs and sandbox entries must be gated by environment exposure.
- Navigation items are converted into AI route candidates by the app shell, not by features.
