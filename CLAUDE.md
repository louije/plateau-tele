# plateau-tele

Shared movie/TV watchlist for two users. French-first, mobile-first, iOS conventions.

Server deployment details are in `claude.local.md` (git-excluded).

## Run

```sh
bun install
bun run dev          # bun --watch server/index.ts
bun run start        # same, without --watch
```

There is no build step. The server transpiles `client/*.ts` and `shared/*.ts` to ES
modules on the fly with `Bun.Transpiler` (see `server/index.ts`) — no bundler, no
`dist/` output. The `dist/` directory in the working tree is stale and unused.

Needs a `.env`. `TMDB_API_KEY` is the only required key; `DB_PATH`, `PORT`, `LOCALE`,
`USERS`, `JELLYSEERR_URL` and `JELLYSEERR_API_KEY` are optional. See `.env.example`.

## Test

```sh
bun test             # 109 tests across 7 files
bun run test:watch
```

`bunfig.toml` sets the test root to `server/__tests__`, so `bun test` runs the backend
suite only. `client/lib/format-watched-at.test.ts` exists but is outside that root —
run it explicitly with `bun test client/lib/format-watched-at.test.ts`.

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
client/                 # Browser code, transpiled per-request by the server
  components/           # Web Components (<search-bar>, <watch-list>, <watched-list>)
  i18n/                 # Client-side i18n (imports shared keys)
  lib/                  # Pure utilities (debounce, title display, accent color,
                        #   watch-item helpers, watched-at formatting + its unit test)
  services/             # API client (fetch wrappers) and SSE subscription
  styles/               # CSS files, layered: reset → base → layout → components
  index.html            # Home page (SPA shell)
  watched.html          # Watched-list page
  main.ts               # Home page entry point
  detail.ts             # Detail + add-modal entry point
  watched.ts            # Watched page entry point
  styles.css            # CSS import aggregator (@import)

server/                 # Hono API, runs on Bun
  __tests__/            # Backend tests (bun:test)
  db/                   # Drizzle schema + connection
  routes/               # Route modules (items, search, events, detail, jellyseerr)
  views/                # Server-rendered HTML templates (hono/html)
  app.ts                # Hono app factory, route registration
  index.ts              # Entry point (migrations, TS transpilation, static serving)
  sse.ts                # SSE broadcast hub
  tmdb.ts               # TMDB API client
  jellyseerr.ts         # Jellyseerr API client
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
| POST | `/api/items/reorder` | Batch reorder |
| GET | `/api/search?q=` | Search TMDB (movies, TV, people) |
| GET | `/api/search/details/:type/:id` | TMDB details for one title |
| GET | `/api/events` | SSE stream |
| POST | `/api/jellyseerr/request` | Request a title in Jellyseerr |
| DELETE | `/api/jellyseerr/request/:id` | Cancel a Jellyseerr request |
| POST | `/api/jellyseerr/batch-status` | Availability for several titles at once |
| GET | `/detail/:type/:id` | Server-rendered detail page |
| GET | `/detail/:type/:id/add` | Server-rendered add-to-list modal |
| GET | `/healthz` | Health check (used by slot-machine) |

## Authentication

WebAuthn (passkeys) via [Quiq/webauthn_proxy](https://github.com/Quiq/webauthn_proxy), a standalone Go binary running as a separate systemd service. Caddy's `forward_auth` delegates auth checks to it. The proxy handles `/webauthn/login` and `/webauthn/auth`; everything else is gated behind the auth check.

- Config and binary live on the server outside the app directory.
- Credentials are in a `credentials.yml` file alongside the proxy config. Registration via `/webauthn/register` produces a base64 blob that must be pasted into this file and the proxy restarted — registration alone doesn't grant access.
- The `/webauthn/register` route is blocked at the Caddy level (403) as an extra precaution.
- The proxy sets `X-Authenticated-User` header on authenticated requests.

## How things connect

- Home page is a static HTML shell (`client/index.html`) with two web components
  (`<search-bar>`, `<watch-list>`); `/watched` serves `client/watched.html`
- `<search-bar>` calls `/api/search`, renders results as links to `/detail/:type/:id`
- Detail and add-modal pages are server-rendered by Hono views, with client JS for interactivity
- Cross-document View Transitions (`@view-transition { navigation: auto }`) animate between pages
- SSE keeps multiple open tabs in sync — any mutation broadcasts to all clients
- `?q=` param threads search context through detail → add → cancel → home
- Jellyseerr integration (optional, keyed off `JELLYSEERR_URL`/`JELLYSEERR_API_KEY`)
  shows availability and lets a title be requested from the detail page

## Code standards

- No frameworks on the client. Vanilla TypeScript, web components, platform APIs.
- No build step at all — the server transpiles TS to ES modules per request. Client
  code must therefore be valid as unbundled ES modules: relative imports carry
  explicit `.js` extensions, and npm deps are resolved by an import map in the page
  head against a server route (`sortablejs` → `/vendor/sortable.esm.js`).
- Semantic HTML. Accessible. Use `<template>` for repeated structures.
- Server views use `hono/html` tagged template literals, not JSX or a template engine.
- i18n: all user-facing strings go through `t(locale, key)`. Keys are typed via `as const`.
- CSS uses `@layer` for ordering, custom properties for tokens, `color-mix()` for derived colors.
- Keep functions small. Prefer composition over inheritance. No classes except web components.
- Tests are backend-first. Each backend test file covers one route module and uses
  `app.request()` directly. Pure client utilities may have unit tests next to them.
- One concern per file. If a file does two things, split it.
- Commit messages: one line, no signing, atomic changes.
