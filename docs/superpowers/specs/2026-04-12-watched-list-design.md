# Watched-films list — design

Status: approved
Date: 2026-04-12

## Goal

Add a "films already watched" view to plateau-tele, reached from a new icon
button placed to the left of the search bar on the home page. The view shows
items marked watched, sorted by the date they were watched (latest first),
with an inline "Regardé …" timestamp on each row. Items are read-only on
this page — taps open the existing detail page where unwatch/delete already
live.

Both lists render rows through a single shared helper so the DOM structure
stays authoritative in one place (`<template id="watch-item-tpl">`).

## Data layer

### Schema

Add one nullable column to `watch_items`:

```ts
// server/db/schema.ts
watchedAt: text("watched_at"),
```

Set only when `watched` transitions from `false → true`. Cleared to `null`
on `true → false`. Never touched on note-only edits (this is the whole
reason we can't reuse `updated_at`).

### Migration

Run `bun run db:generate` after editing `schema.ts` — drizzle-kit will
emit a new migration file (next available number) with the `ALTER TABLE`.
Then **hand-edit** that generated SQL file to append the backfill:

```sql
ALTER TABLE watch_items ADD COLUMN watched_at TEXT;
--> statement-breakpoint
UPDATE watch_items SET watched_at = updated_at WHERE watched = 1;
```

Drizzle's `--> statement-breakpoint` marker tells the migrator these are
two separate statements. The backfill uses `updated_at` as a best-effort
historical timestamp for rows that are already watched: prod
already-watched items get roughly correct dates, new items are exact.

### Shared types

```ts
// shared/types.ts — WatchItem
watchedAt: string | null;
```

No change to `WatchItemCreate`. No new SSE variant — `item:watched` already
carries the full item, so the new timestamp rides along for free.

## Server changes

### `server/routes/items.ts`

- `rowToItem` maps the new column into the returned `WatchItem`.
- `GET /api/items?watched=true` orders by `desc(watchedAt), desc(id)`.
  `?watched=false` (the default) keeps ordering by `asc(position)` as today.
- `PATCH /api/items/:id` computes `watchedAt` in the update set **only when
  `watched` is present in the request body**:
  - `body.watched === true` → `watchedAt: sql\`datetime('now')\``
  - `body.watched === false` → `watchedAt: null`
  - otherwise → omit the key entirely (don't clobber on note edits)

### `server/index.ts`

Register a handler for `GET /watched` that serves `client/watched.html`,
following the same pattern used for `index.html`. If static serving today
already maps the full `client/` dir, the file is reachable automatically
and only the "bare URL without `.html`" case needs a tiny handler.

## Client architecture

### New: `client/lib/watch-item.ts`

Pure render helper. One function, no class, no DOM side-effects beyond
cloning and filling the template fragment.

```ts
export interface RenderOptions {
  showWatchedAt?: boolean;     // watched list
  showJellyfinBadge?: boolean; // active list only
}

export function renderWatchItem(
  item: WatchItem,
  opts?: RenderOptions,
): HTMLLIElement;
```

Responsibilities:

- Clone `#watch-item-tpl` content.
- Fill poster, title, subtitle, meta (type · year · country · duration),
  director/creator, note, added-by pill with deterministic hue.
- If `showWatchedAt`, fill `.watch-item__watched-at` with the formatted
  string; otherwise remove that span from the fragment.
- If `!showJellyfinBadge`, remove `.watch-item__jellyfin` from the fragment.
  (Active list keeps it, watched list drops it — no Jellyseerr round-trip
  for things you've already seen.)
- Return the `<li>` element for the caller to append.

`hashHue` moves out of `watch-list.ts` and into this file (or into
`lib/accent-color.ts` — decide during implementation based on where it
reads more naturally; both are fine).

### New: `client/lib/format-watched-at.ts`

Pure function:

```ts
export function formatWatchedAt(iso: string, locale: Locale): string;
```

Branches on the number of whole days between now and the given timestamp
(in local time):

| Delta | French example | English example |
|---|---|---|
| 0 | "Regardé aujourd'hui" | "Watched today" |
| 1 | "Regardé hier" | "Watched yesterday" |
| 2–6 | "Regardé il y a 3 jours" | "Watched 3 days ago" |
| 7+ same year | "Regardé le 12 mars" | "Watched on 12 Mar" |
| different year | "Regardé le 4 nov. 2025" | "Watched on 4 Nov 2025" |

Uses `Intl.DateTimeFormat(locale, …)` for the absolute variant and plain
i18n string templates (`"Regardé il y a {n} jours"`) for the relative ones.
Purely functional, testable without a DOM.

### Modified: `client/components/watch-list.ts`

Slimmed down. Keeps Sortable, SSE handling, Jellyfin status fetching, and
first-poster accent colour. `render()` becomes a thin loop that calls
`renderWatchItem(item, { showJellyfinBadge: true })` for each item. All
the per-row DOM fiddling moves to `watch-item.ts`.

### New: `client/components/watched-list.ts`

A new `<watched-list>` custom element. Intentionally small:

- `connectedCallback`: sets up the `<ul class="watch-list watch-list--watched">`
  shell, calls `load()`, subscribes to SSE.
- `load()`: fetches `/api/items?watched=true` and renders rows via
  `renderWatchItem(item, { showWatchedAt: true })`.
- SSE handlers (no Sortable, no reorder):
  - `item:watched` → prepend the new item (it carries the freshest
    `watchedAt`).
  - `item:updated` → if the item is in the list, replace it in place
    (note edits). If `watched` flipped to `false`, drop it.
  - `item:removed` → drop by id if present.
  - `item:added`, `item:reordered` → ignored.
- Sets accent colour from first item's poster, same as active list.
- Renders the empty-state message (`watchedList.empty`) when the list is
  empty.

### Template change

`<template id="watch-item-tpl">` in both `client/index.html` and the new
`client/watched.html` gets one extra span:

```html
<span class="watch-item__watched-at"></span>
```

placed in `.watch-item__body` after `.watch-item__meta`. Hidden by default
via CSS (`display: none`) and shown when an ancestor has the
`.watch-list--watched` class. The template stays the single source of truth
for row structure — duplication across the two HTML pages is ~15 lines and
is accepted in exchange for avoiding any build-step partials.

## Page structure and routing

### New: `client/watched.html`

```html
<header class="page-header">
  <a class="page-header__back" href="/"><!-- chevron --> Retour</a>
  <h1 class="page-header__title">Films regardés</h1>
</header>
<main>
  <watched-list></watched-list>
</main>
<!-- <template id="watch-item-tpl"> duplicated here -->
```

No hero logo, no parallax. The page is intentionally quieter than the home
page — it is an archive, not a destination.

### New: `client/watched.ts`

```ts
import "./components/watched-list.js";
import { connect } from "./services/events.js";
import { getLocale } from "./i18n/index.js";

document.documentElement.lang = getLocale();
connect();
```

### Navigation

Cross-document view transitions (already enabled via
`<meta name="view-transition" content="same-origin">`) animate the
`/ ↔ /watched` swap. The links are plain anchors:

- Home → watched: the new eye icon is an `<a href="/watched">`.
- Watched → home: back link is an `<a href="/">`.

No JS for navigation. No History API manipulation. Matches how detail
pages already work.

### Home header layout change

`client/index.html` gets a wrapper around the search bar:

```html
<div class="home-header">
  <a class="home-header__watched-link" href="/watched" aria-label="Films regardés">
    <!-- inline SVG: TV-screen rectangle with an eye inside -->
  </a>
  <search-bar></search-bar>
</div>
```

CSS:

- `.home-header { display: flex; gap: var(--space-sm); align-items: stretch;
  position: sticky; top: env(safe-area-inset-top, 0px); z-index: 10; }`
- The `position: sticky` currently on `search-bar` moves up to
  `.home-header`. The search bar loses its own sticky rule.
- `.home-header__watched-link` is a square button, `aspect-ratio: 1`, same
  computed height as the search input. Inline SVG icon, `currentColor`,
  ~24 px. The button sits next to (not inside) `<search-bar>` — no custom
  element surgery needed.

### Mobile search overlay interaction

The existing `.search-bar.is-active` rules go fullscreen (`position: fixed;
inset: 0;`). That takes it out of the sticky header flow, which is fine —
the icon button stays on the underlying home page beneath the overlay and
is hidden by it. **Risk to test:** verify the fullscreen search animation
still looks right after moving sticky up one level.

## i18n

Add to both `shared/i18n/en.ts` and `shared/i18n/fr.ts`:

| Key | fr | en |
|---|---|---|
| `watchedList.title` | Films regardés | Watched films |
| `watchedList.empty` | Rien de regardé pour l'instant. | Nothing watched yet. |
| `watchedList.linkLabel` | Films regardés | Watched films |
| `watchItem.watchedToday` | Regardé aujourd'hui | Watched today |
| `watchItem.watchedYesterday` | Regardé hier | Watched yesterday |
| `watchItem.watchedDaysAgo` | Regardé il y a {n} jours | Watched {n} days ago |
| `watchItem.watchedOn` | Regardé le {date} | Watched on {date} |

The `{n}` and `{date}` placeholders are substituted by `formatWatchedAt`
via plain `.replace()`. Reuses `detail.back` ("Retour" / "Back").

## Testing

### Backend

In `server/__tests__/items.test.ts` (or its equivalent split), add cases:

1. `PATCH /api/items/:id` with `{ watched: true }` sets `watched_at` to a
   non-null value and returns it on the response.
2. `PATCH` with `{ watched: false }` clears `watched_at` back to `null`.
3. `PATCH` with `{ note: "..." }` leaves `watched_at` untouched (use a row
   that was pre-watched with a fixed `watched_at`, edit the note, assert
   unchanged).
4. `GET /api/items?watched=true` returns rows in `watched_at DESC, id DESC`
   order (insert two rows with explicit `watched_at` + a third sharing one
   of the timestamps to exercise the tiebreak).
5. Unchanged: `GET /api/items` (default) still returns unwatched rows in
   `position ASC`.

### Client

New: `client/lib/format-watched-at.test.ts` — covers each branch of the
date formatter in both `fr` and `en` with a frozen "now". This is the
project's first client-side test; it is a pure module with no DOM deps so
`bun test` picks it up without changes to the test harness. Tests today
are backend-only per CLAUDE.md — this is a deliberate, flagged exception
because the unit is a self-contained pure function. If the reviewer prefers
the client test dropped, delete the file; the feature still works.

## Edge cases

- **Empty watched list:** `watchedList.empty` message, same pattern as
  `.watch-list__empty`.
- **Newly watched while /watched is open** (second tab): `item:watched`
  SSE → prepend.
- **Note edited from detail while /watched is open:** `item:updated` →
  replace in place.
- **Item unwatched while /watched is open:** `item:updated` with
  `watched: false` → drop from the list.
- **Reorder SSE received on /watched:** ignored (no positions here).
- **Empty watched list accent colour:** skip silently; no first poster.
- **Direct `/watched` deep-link:** works normally; WebAuthn proxy gates it
  at Caddy just like every other route.
- **Browsers without cross-document view transitions:** plain navigation,
  no fallback code needed.
- **Tie on `watched_at`:** broken by `id DESC` (most recently inserted
  wins).

## Out of scope (deliberate non-goals)

- Pagination on the watched list. Unbounded for now — fine at personal
  scale. Revisit when it's longer than the viewport is patient for.
- Search or filter within watched.
- Stats ("12 films this month", etc).
- Unwatch / delete actions on the watched page itself. They stay on the
  detail page where they already live.
- Hero logo / parallax on `/watched`.
- Moving the shared `<template>` out of the two HTML files into a partial.

## Risks

1. **Mobile sticky-header regression.** Moving `position: sticky` from
   `search-bar` up to `.home-header` could subtly affect the fullscreen
   search overlay animation — that overlay uses `position: fixed; inset: 0`
   to escape the header, so it *should* still work, but the interaction
   between the two position rules is easy to get subtly wrong. Mitigation:
   end-to-end test the mobile search flow on a real phone before calling
   done. If broken, the fallback is to keep the sticky rule on `search-bar`
   and put the icon button in a non-sticky sibling.
2. **Prod migration on an additive column.** `ALTER TABLE ... ADD COLUMN`
   plus a one-pass `UPDATE` on every already-watched row. DB is
   personal-scale so negligible in practice, but every schema change on
   prod deserves a fresh pre-deploy backup (see Deployment notes below).
3. **Backfill isn't exercised by the test suite.** Fresh test DBs have no
   rows to backfill, so the generated migration's `UPDATE` step runs
   against zero rows and passes vacuously. The behavioural assertion
   (existing watched rows get a non-null `watched_at`) only gets exercised
   on prod. Mitigation: a one-shot manual test on a copy of the prod DB
   before deploy, or a dedicated migration test that seeds rows before
   running migrations — the spec doesn't require this, but it's the
   obvious thing to add if paranoia warrants.
4. **i18n placeholder substitution.** `formatWatchedAt` uses plain
   `.replace("{n}", String(n))`. If a future translator introduces a
   translation that accidentally contains a literal `{n}`, behaviour is
   surprising. Unlikely; not worth a templating engine.

## Deployment notes

**Before deploying this change, back up the prod DB.** The migration is
additive (new column + one-pass backfill) and rollback-safe in principle,
but it's still a schema change and the R2 nightly is too stale a safety
net for a "deploy just happened" scenario.

1. Create a pre-deploy backup on the server:
   ```
   ssh plateau-tele@ljt.cc \
     'cp /srv/plateau-tele/data/plateau.db \
         /srv/plateau-tele/backups/plateau-pre-watched-list-$(date +%F).db'
   ```
   The live `.db` file is WAL-mode; a plain `cp` captures the main file but
   not unflushed WAL contents. For strict safety, use
   `sqlite3 /srv/plateau-tele/data/plateau.db ".backup '/srv/plateau-tele/backups/plateau-pre-watched-list-$(date +%F).db'"`
   which is how `r2-backup.sh` already handles it.
2. Merge PR to `main`. GitHub Actions runs `.github/workflows/deploy.yml`.
3. Verify the deploy script applies drizzle migrations as part of
   `slot-machine deploy`. If it doesn't, add a `bun run db:migrate` step.
   (This needs to be confirmed while reading `deploy.sh` and
   `slot-machine.json` during implementation.)
4. Smoke test post-deploy:
   - Load `/`, click the eye icon, confirm `/watched` renders (even if
     empty).
   - Mark a brand-new item watched from the detail page; open a second
     tab on `/watched` and confirm the SSE prepend works.
   - Open a second tab on `/`, mark something watched — the item should
     disappear from `/` and appear on `/watched` at the top of a second
     `/watched` tab if open.
5. Rollback procedure: `systemctl stop slot-machine-plateau-tele`, restore
   the pre-deploy `.db` backup over `/srv/plateau-tele/data/plateau.db`,
   run `slot-machine rollback` to swap back to the previous slot, start
   the service.

## Housekeeping (same PR)

- `CLAUDE.md` project structure still lists `esbuild.config.js` in the
  tree. That file was removed in `ef0906b`; remove the line. This is a
  one-line doc drift fix, surfaced because the feature touches the doc
  area around client structure.
