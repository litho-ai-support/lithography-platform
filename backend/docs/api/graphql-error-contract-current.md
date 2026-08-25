<!-- docs/api/graphql-error-contract-current.md -->

# GraphQL Error Contract

## AI MUST READ

- This file is a global API contract for every GraphQL query and mutation.
- Read this file before changing GraphQL adapters, guards, exception filters, auth/session behavior, or frontend-facing API docs.
- Endpoint-specific `docs/api/*-current.md` files may add business details, but they must not weaken this contract.

## Non-Negotiable Runtime Contract

- Frontend runtime auth/session branching must use `errors[].extensions.code`.
- `errors[].extensions.code === 'UNAUTHENTICATED'` is the stable signal that the current session is not usable for the requested operation.
- For already-authenticated protected operations, `UNAUTHENTICATED` means frontend may start auth refresh, and if refresh cannot recover, clear local session and logout.
- Frontend must not depend on `errors[].extensions.errorCode` for production runtime branching.
- `extensions.errorCode` is a business/detail code for debugging, tests, observability, compatibility, or optional display. It may be hidden or omitted in production responses.
- HTTP `401` is only a transport-layer fallback for auth failure. GraphQL auth failures may be returned as HTTP `200` with `errors`.
- Legacy frontend fallbacks such as `TOKEN_INVALID` and `TOKEN_INVALID_AFTER_REFRESH` are compatibility only. They are not the stable new contract and must not drive new backend or frontend behavior.

## Auth Flow Boundaries

- Protected queries and mutations must express invalid, expired, malformed, or unverifiable access-token state as `extensions.code === 'UNAUTHENTICATED'`.
- `refresh` failures caused by an invalid, expired, malformed, unverifiable, or unacceptable refresh token must also be treated as `UNAUTHENTICATED` at the GraphQL category level.
- `login` credential failures may also use `UNAUTHENTICATED` as the GraphQL category, but frontend must not run refresh loops for `login` itself. Login-screen behavior is scoped to the login flow.
- Permission failures for an authenticated user remain `FORBIDDEN`, not `UNAUTHENTICATED`.
- Input, validation, conflict, not-found, and business-state failures must not be collapsed into `UNAUTHENTICATED`.
- A disabled, blocked, or not-installed switchable behavior maps to
  `extensions.code === 'INTERNAL_SERVER_ERROR'`. When response policy exposes detail it uses
  `extensions.errorCode === 'CAPABILITY_UNAVAILABLE'`. This is availability state, not
  authentication or resource-authorization failure, and therefore must not map to `FORBIDDEN`.

## Backend Implementation Rules

- Keep `extensions.code` as a small stable GraphQL category.
- Keep business-specific `DomainError.code` values in `extensions.errorCode` only when the response policy allows exposing them.
- Do not introduce interface-specific auth category names for frontend branching.
- Do not require frontend to inspect `JWT_TOKEN_INVALID`, `JWT_TOKEN_EXPIRED`, `JWT_AUTHENTICATION_FAILED`, or similar detail codes to decide refresh/logout behavior.
- Do not document endpoint-specific auth handling that asks frontend to branch on `extensions.errorCode` in production.

## Review Checklist

- Does the changed GraphQL path still expose auth/session failure through `extensions.code === 'UNAUTHENTICATED'`?
- Does the doc or code avoid making `extensions.errorCode` required for frontend production branching?
- Is HTTP `401` treated only as fallback, not the primary GraphQL contract?
- Are old token-detail names described only as compatibility fallbacks?
