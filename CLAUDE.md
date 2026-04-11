# plateau-tele

Shared movie/TV watchlist for two users. French-first, mobile-first, iOS conventions.

Server deployment details are in `claude.local.md` (git-excluded).

## Run

```sh
bun install
bun run dev          # server (--watch) + esbuild (--watch) via concurrently
bun run start        # production server only
bun run build        # client build only
```

Needs a `.env` with `TMDB_API_KEY`. See `.env.example`.

## Test

```sh
bun test             # 32 tests, all backend
bun test --watch
```

Tests use in-memory SQLite via `server/test-utils.ts`. Each test gets a fresh DB with migrations applied. Pattern:

```ts
import { createApp } from "../app.js";
import { createTestDb } from "../test-utils.js";

let db: DbInstance;
let close: () => void;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  ({ db, close } = createTestDb());
  app = createApp(db);
});
afterEach(() => close());
```

Test requests go through `app.request()` — no HTTP server needed.

## Database

SQLite via Drizzle ORM. Single table `watch_items` in `server/db/schema.ts`.

```sh
bun run db:generate  # generate migration from schema changes
bun run db:migrate   # apply migrations
```

Migrations live in `drizzle/`. DB file is `data/plateau.db` (git-ignored).

## Project structure

```
client/                 # Browser code, bundled by esbuild
  components/           # Web Components (<search-bar>, <watch-list>)
  i18n/                 # Client-side i18n (imports shared keys)
  lib/                  # Pure utilities (debounce, title display, accent color)
  services/             # API client (fetch wrappers) and SSE subscription
  styles/               # CSS files, layered: reset → base → layout → components
  index.html            # Home page (SPA shell)
  main.ts               # Home page entry point
  detail.ts             # Detail + add-modal entry point
  styles.css            # CSS import aggregator (@import)

server/                 # Hono API, runs on Bun
  __tests__/            # Backend tests (bun:test)
  db/                   # Drizzle schema + connection
  routes/               # Route modules (items, search, events, detail)
  views/                # Server-rendered HTML templates (hono/html)
  app.ts                # Hono app factory, route registration
  index.ts              # Entry point (migrations + static serving)
  sse.ts                # SSE broadcast hub
  tmdb.ts               # TMDB API client
  test-utils.ts         # In-memory test DB factory

shared/                 # Code shared between server and client
  i18n/                 # Translation strings (en.ts, fr.ts)
  config.ts             # Shared constants
  tmdb-image.ts         # TMDB image URL builder
  types.ts              # TypeScript interfaces (WatchItem, SSEEvent, etc.)

drizzle.config.ts       # Drizzle-kit config
```

## Key routes

| Method | Path | Handler |
|--------|------|---------|
| GET | `/api/items` | List unwatched items (or `?watched=true`) |
| POST | `/api/items` | Add item to watchlist |
| PATCH | `/api/items/:id` | Update item (mark watched, edit note) |
| DELETE | `/api/items/:id` | Remove item |
| PUT | `/api/items/reorder` | Batch reorder |
| GET | `/api/search?q=` | Search TMDB (movies, TV, people) |
| GET | `/api/events` | SSE stream |
| GET | `/detail/:type/:id` | Server-rendered detail page |
| GET | `/detail/:type/:id/add` | Server-rendered add-to-list modal |

## Authentication

WebAuthn (passkeys) via [Quiq/webauthn_proxy](https://github.com/Quiq/webauthn_proxy), a standalone Go binary running as a separate systemd service. Caddy's `forward_auth` delegates auth checks to it. The proxy handles `/webauthn/login` and `/webauthn/auth`; everything else is gated behind the auth check.

- Config and binary live on the server outside the app directory.
- Credentials are in a `credentials.yml` file alongside the proxy config. Registration via `/webauthn/register` produces a base64 blob that must be pasted into this file and the proxy restarted — registration alone doesn't grant access.
- The `/webauthn/register` route is blocked at the Caddy level (403) as an extra precaution.
- The proxy sets `X-Authenticated-User` header on authenticated requests.

## How things connect

- Home page is a static HTML shell (`client/index.html`) with two web components
- `<search-bar>` calls `/api/search`, renders results as links to `/detail/:type/:id`
- Detail and add-modal pages are server-rendered by Hono views, with client JS for interactivity
- Cross-document View Transitions (`@view-transition { navigation: auto }`) animate between pages
- SSE keeps multiple open tabs in sync — any mutation broadcasts to all clients
- `?q=` param threads search context through detail → add → cancel → home

## Code standards

- No frameworks on the client. Vanilla TypeScript, web components, platform APIs.
- No build step abstractions — esbuild bundles TS to ES modules, that's it.
- Semantic HTML. Accessible. Use `<template>` for repeated structures.
- Server views use `hono/html` tagged template literals, not JSX or a template engine.
- i18n: all user-facing strings go through `t(locale, key)`. Keys are typed via `as const`.
- CSS uses `@layer` for ordering, custom properties for tokens, `color-mix()` for derived colors.
- Keep functions small. Prefer composition over inheritance. No classes except web components.
- Tests are backend-only. Each test file covers one route module. Use `app.request()` directly.
- One concern per file. If a file does two things, split it.
- Commit messages: one line, no signing, atomic changes.
