<!-- docs/testing.md -->

# Testing

- Use Vitest for unit tests close to pure logic.
- Keep route and UI tests focused on the behavior being changed.
- For narrow changes, prefer `npx tsc --noEmit` and `npm run lint`.
- For larger shell or routing changes, add browser-level coverage before production use.
