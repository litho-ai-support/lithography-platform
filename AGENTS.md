# Agent Instructions

This repository is a frontend/backend monorepo for the lithography maintenance platform.

## Routing

- Backend changes must follow `backend/AGENTS.md` and the backend documents it routes to.
- Frontend changes must follow `frontend/AGENTS.md` and the frontend documents it routes to.
- Repository workflow and ownership rules live in `CONTRIBUTING.md`.
- Database baseline decisions live in `docs/database/`.

## Repository Rules

- Do not commit secrets, local environment files, database files, training data, model weights, uploads, logs, or generated build output.
- Do not edit an accepted baseline migration without explicit maintainer approval.
- A page feature is complete only when its frontend, GraphQL contract, backend behavior, authorization, tests, and acceptance evidence are handled together.
- Preserve upstream notices and licenses.
