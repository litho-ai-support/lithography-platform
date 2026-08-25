# AGENTS.md

AI agent rules for this minimal frontend example.

## Priority

- Layer and dependency rules win first.
- Topic rules apply only after ownership is clear.
- Keep changes small and place code in the narrowest owner.

## Stack

- React 19, TypeScript, Vite, React Router Data Mode.
- Ant Design owns business UI.
- Ant Design X owns AI interaction UI.
- Tailwind owns layout wrappers.
- Apollo owns GraphQL client/runtime.
- Alias: `@/` maps to `src/`.
- Env files live in `env/`, not the repo root.

## Placement

- Stable: `src/app`, `src/pages`, `src/widgets`, `src/features`, `src/entities`, `src/shared`.
- Labs: `src/labs/<name>`; use `access.ts`, `meta.ts`, and a public `index.ts`.
- Sandbox: `src/sandbox/<name>`; dev/test only.
- New source/docs files should start with a path header.

## Dependencies

- `pages -> widgets, features, entities, shared`
- `widgets -> features, entities, shared`
- `features -> entities, shared`
- `entities -> shared`
- `shared -> shared only`
- `labs -> same lab, shared, entities public API`
- `sandbox -> same sandbox, shared, entities public API`
- `app/router -> labs/sandbox public route API only`

Use public barrels for cross-module imports, for example `@/features/local-assistant`.

## UI

- No Tailwind `className` on Ant Design or Ant Design X component bodies.
- Put Tailwind classes on wrapper elements.
- Colors, radius, shadow, and z-index should use Ant Design tokens or CSS variables.
- Do not add raw hex/rgb/hsl colors outside documented theme tokens; read `docs/ui-design/colors.md`.
- Dark mode uses `.dark`.
- Main app paths must work without the AI sidecar.

## Commands

- Dev/build: `npm run dev`, `npm run build`
- Check: `npm run lint`, `npm run format:check`, `npx tsc --noEmit`
- Fix: `npm run lint:fix`, `npm run format`
