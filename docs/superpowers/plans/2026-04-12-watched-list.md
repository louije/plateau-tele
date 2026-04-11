# Watched-List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/watched` page showing items that have been marked watched, sorted by watched date (latest first), reached via an icon button next to the home search bar. Both lists share a single `renderWatchItem` helper.

**Architecture:** New `watched_at` timestamp column on `watch_items`, set only when `watched` flips true. A pure `renderWatchItem(item, opts)` function renders rows from the existing `<template id="watch-item-tpl">`; `<watch-list>` (active) and `<watched-list>` (new) both call it. `/watched` is a new static HTML page served by the existing Hono app, with cross-document view transitions animating the nav.

**Tech Stack:** Bun + Hono + Drizzle ORM (SQLite), vanilla web components on the client, `bun test` (bun:test).

**Spec:** `docs/superpowers/specs/2026-04-12-watched-list-design.md`

---

## File structure

**Create:**
- `drizzle/0003_<drizzle-generated-name>.sql` — schema migration (hand-edited for backfill)
- `client/lib/format-watched-at.ts` — pure date-formatting helper
- `client/lib/format-watched-at.test.ts` — unit tests for the formatter
- `client/lib/watch-item.ts` — pure row-rendering helper shared by both lists
- `client/components/watched-list.ts` — new `<watched-list>` web component
- `client/watched.html` — the `/watched` page shell
- `client/watched.ts` — entry point for `/watched`

**Modify:**
- `server/db/schema.ts` — add `watchedAt` column
- `shared/types.ts` — add `watchedAt` to `WatchItem`
- `shared/i18n/en.ts` + `shared/i18n/fr.ts` — new keys
- `server/routes/items.ts` — PATCH sets/clears `watched_at`; GET orders watched list by `watched_at DESC`
- `server/__tests__/items.test.ts` — new test cases for PATCH behaviour and GET ordering
- `client/components/watch-list.ts` — slim `render()` to call `renderWatchItem`
- `client/index.html` — home header wrapper + icon button + `.watch-item__watched-at` span in template
- `client/styles/components.css` — `.home-header`, `.home-header__watched-link`, `.watch-item__watched-at` visibility, `.watch-list--watched`
- `server/index.ts` — serve `/watched` → `client/watched.html`
- `CLAUDE.md` — drop stale `esbuild.config.js` line (housekeeping)

---

## Task 1: Add `watched_at` schema column and migration

**Files:**
- Modify: `server/db/schema.ts`
- Create: `drizzle/0003_<auto>.sql` (via `bun run db:generate`, then hand-edit)

- [ ] **Step 1: Add the column to the schema**

Edit `server/db/schema.ts`. After the `watched` line (around line 19), add:

```ts
  watched: integer("watched", { mode: "boolean" }).notNull().default(false),
  watchedAt: text("watched_at"),
  createdAt: text("created_at")
```

The new column is nullable: it's only set when `watched` transitions to true.

- [ ] **Step 2: Generate the migration**

Run: `bun run db:generate`
Expected: a new file appears at `drizzle/0003_<some-name>.sql` containing `ALTER TABLE \`watch_items\` ADD \`watched_at\` text;`.

- [ ] **Step 3: Hand-edit the migration to add the backfill**

Open the new `drizzle/0003_*.sql`. Append a statement-breakpoint and the backfill `UPDATE`:

```sql
ALTER TABLE `watch_items` ADD `watched_at` text;--> statement-breakpoint
UPDATE `watch_items` SET `watched_at` = `updated_at` WHERE `watched` = 1;
```

The backfill gives existing already-watched rows a best-effort historical timestamp from `updated_at`.

- [ ] **Step 4: Apply the migration locally**

Run: `bun run db:migrate`
Expected: drizzle-kit reports applying the new migration, no errors.

- [ ] **Step 5: Commit**

```bash
git add server/db/schema.ts drizzle/0003_*.sql drizzle/meta/
git commit -m "add watched_at column with backfill migration"
```

---

## Task 2: Extend shared types and i18n with new keys

**Files:**
- Modify: `shared/types.ts`
- Modify: `shared/i18n/en.ts`
- Modify: `shared/i18n/fr.ts`

- [ ] **Step 1: Add `watchedAt` to `WatchItem`**

Edit `shared/types.ts`. Inside `interface WatchItem`, after `watched: boolean;`, add:

```ts
  watched: boolean;
  watchedAt: string | null;
  createdAt: string;
```

Leave `WatchItemCreate` unchanged — items cannot be created-as-watched.

- [ ] **Step 2: Add i18n keys to `shared/i18n/en.ts`**

Edit `shared/i18n/en.ts`. Before the closing `} as const;`, add:

```ts
  "watchedList.title": "Watched films",
  "watchedList.empty": "Nothing watched yet.",
  "watchedList.linkLabel": "Watched films",
  "watchItem.watchedToday": "Watched today",
  "watchItem.watchedYesterday": "Watched yesterday",
  "watchItem.watchedDaysAgo": "Watched {n} days ago",
  "watchItem.watchedOn": "Watched on {date}",
```

- [ ] **Step 3: Mirror the keys in `shared/i18n/fr.ts`**

Edit `shared/i18n/fr.ts`. Before the closing `} as const;`, add:

```ts
  "watchedList.title": "Films regardés",
  "watchedList.empty": "Rien de regardé pour l'instant.",
  "watchedList.linkLabel": "Films regardés",
  "watchItem.watchedToday": "Regardé aujourd'hui",
  "watchItem.watchedYesterday": "Regardé hier",
  "watchItem.watchedDaysAgo": "Regardé il y a {n} jours",
  "watchItem.watchedOn": "Regardé le {date}",
```

The `fr.ts` type-check (`const fr: typeof en = …`) will fail if any key is missing from either file — run `bunx tsc --noEmit` in Step 4 to confirm.

- [ ] **Step 4: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/i18n/en.ts shared/i18n/fr.ts
git commit -m "add watchedAt type and watched-list i18n keys"
```

---

## Task 3: Server PATCH — set and clear `watched_at` on watch toggle (TDD)

**Files:**
- Test: `server/__tests__/items.test.ts`
- Modify: `server/routes/items.ts`

- [ ] **Step 1: Write three failing tests**

Open `server/__tests__/items.test.ts` and append a new `describe` block at the end of the file (before the last `});`, outside any existing describe):

```ts
describe("PATCH /api/items/:id — watched_at handling", () => {
  it("sets watchedAt when watched flips to true", async () => {
    const createRes = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const created = (await createRes.json()) as WatchItem;
    expect(created.watchedAt).toBeNull();

    const patchRes = await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ watched: true }),
    });
    const patched = (await patchRes.json()) as WatchItem;
    expect(patched.watched).toBe(true);
    expect(patched.watchedAt).toBeTruthy();
    expect(Date.parse(patched.watchedAt!)).not.toBeNaN();
  });

  it("clears watchedAt when watched flips back to false", async () => {
    const createRes = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const created = (await createRes.json()) as WatchItem;

    await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ watched: true }),
    });
    const patchRes = await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ watched: false }),
    });
    const patched = (await patchRes.json()) as WatchItem;
    expect(patched.watched).toBe(false);
    expect(patched.watchedAt).toBeNull();
  });

  it("leaves watchedAt untouched on note-only edits", async () => {
    const createRes = await req("/", {
      method: "POST",
      body: JSON.stringify(sampleItem),
    });
    const created = (await createRes.json()) as WatchItem;
    const watchRes = await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ watched: true }),
    });
    const firstWatchedAt = ((await watchRes.json()) as WatchItem).watchedAt;

    // Wait a tick so datetime('now') would differ if touched
    await new Promise((r) => setTimeout(r, 1100));

    const noteRes = await req(`/${created.id}`, {
      method: "PATCH",
      body: JSON.stringify({ note: "updated reason" }),
    });
    const afterNote = (await noteRes.json()) as WatchItem;
    expect(afterNote.note).toBe("updated reason");
    expect(afterNote.watchedAt).toBe(firstWatchedAt);
  });
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `bun test server/__tests__/items.test.ts -t "watched_at handling"`
Expected: 3 tests fail. The first two fail because `patched.watchedAt` is `undefined` (schema has it but `rowToItem` doesn't map it, and PATCH doesn't set it). The third fails once #1 passes.

- [ ] **Step 3: Map the column in `rowToItem`**

Edit `server/routes/items.ts`. In `rowToItem` (around line 10), after the `watched: row.watched,` line add:

```ts
    watched: row.watched,
    watchedAt: row.watchedAt,
    createdAt: row.createdAt,
```

- [ ] **Step 4: Set/clear `watchedAt` in the PATCH handler**

Edit `server/routes/items.ts`. Replace the current PATCH handler body (around lines 103-127) with one that computes `watchedAt` when `watched` is in the body:

```ts
// PATCH /api/items/:id — update note, watched status, etc.
items.patch("/:id", async (c) => {
  const db = c.var.db;
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Partial<Pick<WatchItem, "note" | "watched">>>();

  const updateSet: Record<string, unknown> = {
    ...body,
    updatedAt: sql`datetime('now')`,
  };
  if (body.watched === true) {
    updateSet.watchedAt = sql`datetime('now')`;
  } else if (body.watched === false) {
    updateSet.watchedAt = null;
  }

  const updated = db
    .update(schema.watchItems)
    .set(updateSet)
    .where(eq(schema.watchItems.id, id))
    .returning()
    .get();

  if (!updated) return c.json({ error: "not found" }, 404);

  const item = rowToItem(updated);
  if (body.watched !== undefined) {
    broadcast({ type: "item:watched", item });
  } else {
    broadcast({ type: "item:updated", item });
  }
  return c.json(item);
});
```

- [ ] **Step 5: Run the new tests and full items suite**

Run: `bun test server/__tests__/items.test.ts`
Expected: all items tests pass (new + existing).

- [ ] **Step 6: Commit**

```bash
git add server/routes/items.ts server/__tests__/items.test.ts
git commit -m "set watched_at on watched transitions, expose on API"
```

---

## Task 4: Server GET — order watched list by `watched_at DESC` (TDD)

**Files:**
- Test: `server/__tests__/items.test.ts`
- Modify: `server/routes/items.ts`

- [ ] **Step 1: Write a failing ordering test**

Append a new test inside the existing `describe("GET /api/items", …)` block (near the top of `items.test.ts`), immediately after the "returns watched items when ?watched=true" test:

```ts
  it("orders watched items by watchedAt DESC", async () => {
    // Create three items and watch them in a known order.
    const a = (await (
      await req("/", { method: "POST", body: JSON.stringify(sampleItem) })
    ).json()) as WatchItem;
    const b = (await (
      await req("/", {
        method: "POST",
        body: JSON.stringify({ ...sampleItem, tmdbId: 603, title: "The Matrix" }),
      })
    ).json()) as WatchItem;
    const c = (await (
      await req("/", {
        method: "POST",
        body: JSON.stringify({ ...sampleItem, tmdbId: 27205, title: "Inception" }),
      })
    ).json()) as WatchItem;

    // Watch in the order: a, c, b — so the latest-watched order is b, c, a.
    await req(`/${a.id}`, { method: "PATCH", body: JSON.stringify({ watched: true }) });
    await new Promise((r) => setTimeout(r, 1100));
    await req(`/${c.id}`, { method: "PATCH", body: JSON.stringify({ watched: true }) });
    await new Promise((r) => setTimeout(r, 1100));
    await req(`/${b.id}`, { method: "PATCH", body: JSON.stringify({ watched: true }) });

    const res = await app.request("/api/items?watched=true");
    const items = (await res.json()) as WatchItem[];
    expect(items.map((i) => i.title)).toEqual([
      "The Matrix",
      "Inception",
      "Fight Club",
    ]);
  });
```

Note: each `await new Promise((r) => setTimeout(r, 1100))` is needed because SQLite's `datetime('now')` has second resolution.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test server/__tests__/items.test.ts -t "orders watched items by watchedAt DESC"`
Expected: FAIL. The current handler orders watched results by `position` (insertion order), so the returned order is `[Fight Club, The Matrix, Inception]` — wrong.

- [ ] **Step 3: Add `desc` import and branch the orderBy**

Edit `server/routes/items.ts`. Line 2 currently reads:

```ts
import { eq, asc, sql } from "drizzle-orm";
```

Change it to:

```ts
import { eq, asc, desc, sql } from "drizzle-orm";
```

Then replace the current GET handler body (lines 33-43) with one that picks the order clause based on `showWatched`:

```ts
// GET /api/items — list all unwatched (default), or watched with ?watched=true
items.get("/", (c) => {
  const db = c.var.db;
  const showWatched = c.req.query("watched") === "true";
  const query = db
    .select()
    .from(schema.watchItems)
    .where(eq(schema.watchItems.watched, showWatched));
  const rows = showWatched
    ? query
        .orderBy(desc(schema.watchItems.watchedAt), desc(schema.watchItems.id))
        .all()
    : query.orderBy(asc(schema.watchItems.position)).all();
  return c.json(rows.map(rowToItem));
});
```

- [ ] **Step 4: Run the full items suite**

Run: `bun test server/__tests__/items.test.ts`
Expected: all pass (new ordering test + existing unwatched-ordering test still green).

- [ ] **Step 5: Commit**

```bash
git add server/routes/items.ts server/__tests__/items.test.ts
git commit -m "order watched items by watched_at desc"
```

---

## Task 5: Client — `formatWatchedAt` pure helper (TDD)

**Files:**
- Create: `client/lib/format-watched-at.ts`
- Create: `client/lib/format-watched-at.test.ts`

This is the project's first client-side test. It runs under `bun test` because the module is pure — no DOM imports — and bun's test runner picks up `*.test.ts` anywhere in the tree.

- [ ] **Step 1: Write the failing test file**

Create `client/lib/format-watched-at.test.ts` with:

```ts
import { describe, it, expect } from "bun:test";
import { formatWatchedAt } from "./format-watched-at.js";

// Pin "now" so the relative branches are deterministic.
// 2026-04-12 14:00 local.
const NOW = new Date("2026-04-12T14:00:00").getTime();

function daysAgo(n: number): string {
  // n full days ago at noon, so it's unambiguously "n days" regardless of now's clock time.
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

describe("formatWatchedAt (fr)", () => {
  it("says 'aujourd'hui' for today", () => {
    expect(formatWatchedAt(daysAgo(0), "fr", NOW)).toBe("Regardé aujourd'hui");
  });

  it("says 'hier' for yesterday", () => {
    expect(formatWatchedAt(daysAgo(1), "fr", NOW)).toBe("Regardé hier");
  });

  it("says 'il y a 3 jours' for three days ago", () => {
    expect(formatWatchedAt(daysAgo(3), "fr", NOW)).toBe("Regardé il y a 3 jours");
  });

  it("uses absolute short date (same year) for a week+ ago", () => {
    // Same year as NOW (2026), 14 days before → 2026-03-29
    const result = formatWatchedAt(daysAgo(14), "fr", NOW);
    expect(result.startsWith("Regardé le ")).toBe(true);
    expect(result).not.toMatch(/2026/); // year omitted when it matches NOW
    expect(result).toMatch(/mars/);      // March
  });

  it("includes the year when it differs from NOW", () => {
    // 2025-11-04
    const result = formatWatchedAt("2025-11-04T12:00:00Z", "fr", NOW);
    expect(result.startsWith("Regardé le ")).toBe(true);
    expect(result).toMatch(/2025/);
  });
});

describe("formatWatchedAt (en)", () => {
  it("says 'today'", () => {
    expect(formatWatchedAt(daysAgo(0), "en", NOW)).toBe("Watched today");
  });

  it("says 'yesterday'", () => {
    expect(formatWatchedAt(daysAgo(1), "en", NOW)).toBe("Watched yesterday");
  });

  it("says '3 days ago'", () => {
    expect(formatWatchedAt(daysAgo(3), "en", NOW)).toBe("Watched 3 days ago");
  });

  it("uses absolute same-year format for 14 days ago", () => {
    const result = formatWatchedAt(daysAgo(14), "en", NOW);
    expect(result.startsWith("Watched on ")).toBe(true);
    expect(result).not.toMatch(/2026/);
  });

  it("includes year for a prior-year date", () => {
    const result = formatWatchedAt("2025-11-04T12:00:00Z", "en", NOW);
    expect(result.startsWith("Watched on ")).toBe(true);
    expect(result).toMatch(/2025/);
  });
});
```

Note the third argument to `formatWatchedAt` — it's an optional "now" override, required for deterministic tests. The production code will default it to `Date.now()`.

- [ ] **Step 2: Run the test — expect failure**

Run: `bun test client/lib/format-watched-at.test.ts`
Expected: FAIL with "Cannot find module './format-watched-at.js'" or similar.

- [ ] **Step 3: Implement `format-watched-at.ts`**

Create `client/lib/format-watched-at.ts`:

```ts
import { t as sharedT } from "../../shared/i18n/index.js";
import type { Locale } from "../../shared/i18n/index.js";

/**
 * Format a "watched at" ISO timestamp as a human-readable string.
 *
 * Branches by whole-day delta from `now` (default `Date.now()`):
 *   0      → "Regardé aujourd'hui" / "Watched today"
 *   1      → "Regardé hier"        / "Watched yesterday"
 *   2–6    → "Regardé il y a N jours" / "Watched N days ago"
 *   7+     → absolute date ("Regardé le 12 mars" / "Watched on 12 Mar"),
 *            with year included iff different from now's year.
 */
export function formatWatchedAt(iso: string, locale: Locale, nowMs: number = Date.now()): string {
  const then = new Date(iso);
  const now = new Date(nowMs);

  const thenMidnight = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const days = Math.round((nowMidnight - thenMidnight) / 86_400_000);

  if (days <= 0) return sharedT(locale, "watchItem.watchedToday");
  if (days === 1) return sharedT(locale, "watchItem.watchedYesterday");
  if (days < 7) {
    return sharedT(locale, "watchItem.watchedDaysAgo").replace("{n}", String(days));
  }

  const sameYear = then.getFullYear() === now.getFullYear();
  const dateFmt = new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return sharedT(locale, "watchItem.watchedOn").replace("{date}", dateFmt.format(then));
}
```

- [ ] **Step 4: Run the tests — expect pass**

Run: `bun test client/lib/format-watched-at.test.ts`
Expected: all 10 tests pass.

- [ ] **Step 5: Commit**

```bash
git add client/lib/format-watched-at.ts client/lib/format-watched-at.test.ts
git commit -m "add formatWatchedAt client helper with tests"
```

---

## Task 6: Template + CSS for the `watched-at` span

**Files:**
- Modify: `client/index.html`
- Modify: `client/styles/components.css`

This step prepares the DOM surface before any renderer touches it. The span is hidden by default and made visible only inside a `.watch-list--watched` container.

- [ ] **Step 1: Add the span to the template**

Edit `client/index.html`. Inside `<template id="watch-item-tpl">`, inside `.watch-item__body`, add `.watch-item__watched-at` right after `.watch-item__meta` (around line 48):

```html
            <span class="watch-item__meta"></span>
            <span class="watch-item__watched-at"></span>
            <span class="watch-item__director"></span>
```

- [ ] **Step 2: Add CSS visibility rules**

Edit `client/styles/components.css`. Inside `@layer components`, after the `.watch-item__meta` rule (around line 278), add:

```css
  .watch-item__watched-at {
    font-size: 0.75rem;
    color: var(--color-text-muted);
    display: none;
  }

  .watch-list--watched .watch-item__watched-at {
    display: inline;
  }
```

- [ ] **Step 3: Commit**

```bash
git add client/index.html client/styles/components.css
git commit -m "add watched-at span to watch item template"
```

---

## Task 7: Extract `renderWatchItem` and refactor `<watch-list>` to use it

**Files:**
- Create: `client/lib/watch-item.ts`
- Modify: `client/components/watch-list.ts`

This is a pure refactor of the active list. The watched-at span is already in the template (Task 6) but stays hidden on the active list because that list's `<ul>` does not carry `.watch-list--watched`.

- [ ] **Step 1: Create the `renderWatchItem` helper**

Create `client/lib/watch-item.ts`:

```ts
import { posterUrl } from "./tmdb-image.js";
import { displayTitle } from "./title.js";
import { t, getLocale } from "../i18n/index.js";
import { formatWatchedAt } from "./format-watched-at.js";
import type { WatchItem } from "../../shared/types.js";

export interface RenderOptions {
  /** Show the "Regardé …" timestamp line. */
  showWatchedAt?: boolean;
  /** Include the Jellyfin availability badge slot (populated later). */
  showJellyfinBadge?: boolean;
}

export function renderWatchItem(item: WatchItem, opts: RenderOptions = {}): HTMLLIElement {
  const tpl = document.getElementById("watch-item-tpl") as HTMLTemplateElement;
  const frag = tpl.content.cloneNode(true) as DocumentFragment;
  const li = frag.querySelector(".watch-item") as HTMLLIElement;
  li.dataset.id = String(item.id);

  const link = li.querySelector(".watch-item__link") as HTMLAnchorElement;
  link.href = `/detail/${item.mediaType}/${item.tmdbId}`;

  const img = li.querySelector(".watch-item__poster") as HTMLImageElement;
  const titleEl = li.querySelector(".watch-item__title")!;
  const subtitleEl = li.querySelector(".watch-item__subtitle")!;
  const meta = li.querySelector(".watch-item__meta")!;
  const watchedAtEl = li.querySelector(".watch-item__watched-at")!;
  const directorEl = li.querySelector(".watch-item__director")!;
  const jellyfinEl = li.querySelector(".watch-item__jellyfin")!;
  const note = li.querySelector(".watch-item__note")!;
  const addedByEl = li.querySelector(".watch-item__added-by") as HTMLElement;

  const src = posterUrl(item.posterPath);
  if (src) img.src = src;

  const { primary, subtitle } = displayTitle(item.title, item.originalTitle, item.originalLanguage);
  titleEl.textContent = primary;
  if (subtitle) subtitleEl.textContent = subtitle;
  else subtitleEl.remove();

  meta.textContent = [
    item.mediaType === "tv" ? t("watchItem.tv") : t("watchItem.movie"),
    item.year,
    item.country,
    item.duration,
  ]
    .filter(Boolean)
    .join(" · ");

  if (opts.showWatchedAt && item.watchedAt) {
    watchedAtEl.textContent = formatWatchedAt(item.watchedAt, getLocale());
  } else {
    watchedAtEl.remove();
  }

  if (item.director) {
    const label = item.mediaType === "tv" ? t("detail.creator") : t("detail.director");
    directorEl.textContent = `${label}\u00a0: ${item.director}`;
  } else {
    directorEl.remove();
  }

  if (!opts.showJellyfinBadge) {
    jellyfinEl.remove();
  }

  note.textContent = item.note || "";

  if (item.addedBy) {
    addedByEl.textContent = item.addedBy;
    addedByEl.style.setProperty("--pill-hue", String(hashHue(item.addedBy)));
  } else {
    addedByEl.remove();
  }

  return li;
}

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(31, h) + name.charCodeAt(i);
  }
  return ((h % 360) + 360) % 360;
}
```

- [ ] **Step 2: Slim down `watch-list.ts`**

Edit `client/components/watch-list.ts`. Replace the imports and the `render()` method, and remove the local `hashHue`. The top of the file should become:

```ts
import Sortable from "sortablejs";
import {
  fetchItems,
  reorderItems,
  fetchJellyfinStatuses,
} from "../services/api.js";
import { subscribe } from "../services/events.js";
import { renderWatchItem } from "../lib/watch-item.js";
import { t } from "../i18n/index.js";
import { applyAccentFromImage } from "../lib/accent-color.js";
import type { WatchItem, SSEEvent, ReorderPayload } from "../../shared/types.js";
```

Replace the body of `render()` (the whole method) with:

```ts
  private render() {
    this.sortable?.destroy();
    this.sortable = null;
    this.list.innerHTML = "";

    if (this.items.length === 0) {
      this.list.innerHTML = `<li class="watch-list__empty">${t("watchList.empty")}</li>`;
      return;
    }

    for (const item of this.items) {
      this.list.appendChild(renderWatchItem(item, { showJellyfinBadge: true }));
    }

    this.initSortable();

    // Accent from first item's poster
    const firstPoster = this.list.querySelector<HTMLImageElement>(".watch-item__poster");
    if (firstPoster) applyAccentFromImage(firstPoster);
  }
```

Delete the `hashHue` function at the bottom of `watch-list.ts` (it lives in `watch-item.ts` now).

- [ ] **Step 3: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run backend tests (smoke)**

Run: `bun test`
Expected: all green. (No client tests exist for `watch-list.ts`, but this confirms the refactor didn't break the server-side.)

- [ ] **Step 5: Manual browser check**

Run: `bun run dev`
Open `http://localhost:3000/` in a browser. Verify:
- The watch list renders with posters, titles, meta, added-by pills — identical to before.
- Drag-to-reorder still works.
- The Jellyfin availability badge still appears for available items.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add client/lib/watch-item.ts client/components/watch-list.ts
git commit -m "extract renderWatchItem helper, refactor watch-list to use it"
```

---

## Task 8: New `<watched-list>` web component

**Files:**
- Create: `client/components/watched-list.ts`

- [ ] **Step 1: Create the component**

Create `client/components/watched-list.ts`:

```ts
import { fetchItems } from "../services/api.js";
import { subscribe } from "../services/events.js";
import { renderWatchItem } from "../lib/watch-item.js";
import { t } from "../i18n/index.js";
import { applyAccentFromImage } from "../lib/accent-color.js";
import type { WatchItem, SSEEvent } from "../../shared/types.js";

export class WatchedList extends HTMLElement {
  private list!: HTMLUListElement;
  private items: WatchItem[] = [];

  connectedCallback() {
    this.innerHTML = `<ul class="watch-list watch-list--watched"></ul>`;
    this.list = this.querySelector(".watch-list")!;

    this.load();
    subscribe((event) => this.onSSE(event));
  }

  private async load() {
    this.items = await fetchItems(true);
    this.render();
  }

  private render() {
    this.list.innerHTML = "";

    if (this.items.length === 0) {
      this.list.innerHTML = `<li class="watch-list__empty">${t("watchedList.empty")}</li>`;
      return;
    }

    for (const item of this.items) {
      this.list.appendChild(renderWatchItem(item, { showWatchedAt: true }));
    }

    const firstPoster = this.list.querySelector<HTMLImageElement>(".watch-item__poster");
    if (firstPoster) applyAccentFromImage(firstPoster);
  }

  private onSSE(event: SSEEvent) {
    switch (event.type) {
      case "item:watched":
        // New arrival on the watched list. Prepend if not already present.
        if (event.item.watched && !this.items.find((i) => i.id === event.item.id)) {
          this.items.unshift(event.item);
          this.render();
        } else if (!event.item.watched) {
          // Un-watched from elsewhere — drop.
          const before = this.items.length;
          this.items = this.items.filter((i) => i.id !== event.item.id);
          if (this.items.length !== before) this.render();
        }
        break;

      case "item:updated": {
        const idx = this.items.findIndex((i) => i.id === event.item.id);
        if (idx !== -1) {
          this.items[idx] = event.item;
          this.render();
        }
        break;
      }

      case "item:removed":
        if (this.items.find((i) => i.id === event.itemId)) {
          this.items = this.items.filter((i) => i.id !== event.itemId);
          this.render();
        }
        break;

      // item:added and item:reordered are irrelevant here.
    }
  }
}

customElements.define("watched-list", WatchedList);
```

`fetchItems(true)` is already supported by the existing `client/services/api.ts` — its signature is `fetchItems(watched = false)`, so no signature change is needed.

- [ ] **Step 2: Type-check**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add client/components/watched-list.ts
git commit -m "add <watched-list> component"
```

---

## Task 9: Create `/watched` page — HTML shell, entry point, and server route

**Files:**
- Create: `client/watched.html`
- Create: `client/watched.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: Create `client/watched.html`**

Create `client/watched.html` with:

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="view-transition" content="same-origin" />
    <title>Films regardés — plateau-télé</title>
    <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
    <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
    <link rel="stylesheet" href="/styles.css" />
    <script type="module" src="/watched.js"></script>
  </head>
  <body>
    <header class="page-header">
      <a class="page-header__back" href="/" aria-label="Retour">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        Retour
      </a>
      <h1 class="page-header__title">Films regardés</h1>
    </header>

    <main>
      <watched-list></watched-list>
    </main>

    <template id="watch-item-tpl">
      <li class="watch-item">
        <a class="watch-item__link" href="">
          <img class="watch-item__poster" alt="" loading="lazy" crossorigin="anonymous" />
          <div class="watch-item__body">
            <strong class="watch-item__title"></strong>
            <span class="watch-item__subtitle"></span>
            <span class="watch-item__meta"></span>
            <span class="watch-item__watched-at"></span>
            <span class="watch-item__director"></span>
            <span class="watch-item__jellyfin"></span>
            <p class="watch-item__note"></p>
          </div>
        </a>
        <span class="watch-item__added-by"></span>
        <span class="watch-item__handle" aria-hidden="true"></span>
      </li>
    </template>
  </body>
</html>
```

The template is duplicated from `client/index.html` intentionally — each page is a standalone SPA shell, and duplicating ~15 lines is cheaper than introducing a build-step partial system.

- [ ] **Step 2: Create the entry point**

Create `client/watched.ts`:

```ts
import "./components/watched-list.js";
import { connect } from "./services/events.js";
import { getLocale } from "./i18n/index.js";

document.documentElement.lang = getLocale();
connect();
```

No hero parallax here — the watched page is deliberately quieter.

- [ ] **Step 3: Serve `/watched` from the Hono app**

Edit `server/index.ts`. The existing file has a SPA fallback at the bottom:

```ts
server.get("/*", serveStatic({ root: "./client", path: "index.html" }));
```

Add an explicit handler for `/watched` **before** that fallback and before the TS transpile handler, right after the `serveStatic` static mounts (around line 57, after `server.use("/index.html", …)`):

```ts
server.use("/index.html", serveStatic({ root: "./client" }));
server.get("/watched", serveStatic({ root: "./client", path: "watched.html" }));
server.use("/watched.html", serveStatic({ root: "./client" }));
```

The `server.get("/*", …)` TS transpile handler above already matches `/*.js` requests, so `/watched.js` will be transpiled from `client/watched.ts` automatically — no extra route needed for the script.

- [ ] **Step 4: Add page-header styles**

Edit `client/styles/components.css`. At the end of the `@layer components` block (before the final `}`), add:

```css
  .page-header {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-md) 0;
  }

  .page-header__back {
    display: inline-flex;
    align-items: center;
    gap: var(--space-xs);
    color: var(--color-accent);
    font-size: 0.95rem;
  }

  .page-header__title {
    font-size: 1rem;
    font-weight: 500;
    margin: 0;
  }
```

- [ ] **Step 5: Smoke-test in the browser**

Run: `bun run dev`
Open `http://localhost:3000/watched` in a browser. Expected:
- Page loads.
- Header shows "← Retour" and "Films regardés".
- If you have any watched items in your dev DB, they render; otherwise the empty-state message appears.
- Back link navigates to `/`.

If there are no watched items in your dev DB, create one: on `/`, open an item's detail page and mark it watched, then revisit `/watched`.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add client/watched.html client/watched.ts server/index.ts client/styles/components.css
git commit -m "add /watched page, route, and header styles"
```

---

## Task 10: Home header — icon button to `/watched`

**Files:**
- Modify: `client/index.html`
- Modify: `client/styles/components.css`

- [ ] **Step 1: Wrap the search bar in `.home-header`**

Edit `client/index.html`. Replace:

```html
    <main>
      <search-bar></search-bar>
      <watch-list></watch-list>
    </main>
```

with:

```html
    <main>
      <div class="home-header">
        <a class="home-header__watched-link" href="/watched" aria-label="Films regardés">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="2" y="5" width="20" height="14" rx="2" />
            <circle cx="12" cy="12" r="3" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          </svg>
        </a>
        <search-bar></search-bar>
      </div>
      <watch-list></watch-list>
    </main>
```

The SVG is a rounded-rect TV screen with a concentric circle + pupil forming an eye.

- [ ] **Step 2: Move sticky from `search-bar` to `.home-header` and add button styles**

Edit `client/styles/components.css`. Find the `search-bar` selector block near the top of `@layer components` (around lines 3-7):

```css
  search-bar {
    position: sticky;
    top: env(safe-area-inset-top, 0px);
    z-index: 10;
  }
```

Replace it with:

```css
  .home-header {
    display: flex;
    align-items: stretch;
    gap: var(--space-sm);
    position: sticky;
    top: env(safe-area-inset-top, 0px);
    z-index: 10;
  }

  .home-header search-bar {
    flex: 1;
    min-width: 0;
  }

  .home-header__watched-link {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    padding: var(--space-sm);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    color: var(--color-text-muted);
    transition: color 0.15s, border-color 0.15s;
  }

  .home-header__watched-link:hover,
  .home-header__watched-link:active {
    color: var(--color-accent);
    border-color: var(--color-accent);
  }
```

`.home-header__watched-link` uses the same `padding`/`background`/`border`/`border-radius` as `.search-bar__input`, so both elements compute to the same height and visually match.

- [ ] **Step 3: Smoke-test**

Run: `bun run dev`
Open `http://localhost:3000/` in a browser. Verify:
- Icon button sits to the left of the search bar, same height.
- Clicking the icon navigates to `/watched` with a view transition.
- Scrolling the home page keeps the header (icon + search bar) sticky together.
- **Mobile check (use DevTools mobile emulation at ≤600px):**
  - Header still sticks at the top.
  - Tapping the search bar still opens the fullscreen search overlay animation without the icon button leaking into the overlay.
  - Cancelling the search overlay returns you to the normal sticky header.

If the mobile overlay is broken, the fallback is: revert the sticky move and instead keep `position: sticky` on `search-bar`, putting `.home-header` as a plain flex wrapper with the icon button in a separate non-sticky area. Discuss with the reviewer before doing this.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add client/index.html client/styles/components.css
git commit -m "add watched-list icon button to home header"
```

---

## Task 11: Housekeeping — remove stale esbuild line from CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remove the line**

Edit `CLAUDE.md`. In the "Project structure" tree, remove the line:

```
esbuild.config.js       # Client bundler config (two entry points)
```

The file was removed in commit `ef0906b` ("remove esbuild, serve TS directly via Bun.Transpiler"). No other references.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "remove stale esbuild.config.js reference from CLAUDE.md"
```

---

## Task 12: Full end-to-end manual verification

**Files:** (none modified)

This is a checklist, not a code task. It runs against the local dev server and confirms the feature works top to bottom before the work is called done.

- [ ] **Step 1: Start the dev server**

Run: `bun run dev`

- [ ] **Step 2: Verify backend test suite is green**

In a second terminal, run: `bun test`
Expected: all tests pass, no new failures.

- [ ] **Step 3: Verify type-check is clean**

Run: `bunx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Home page exercise**

- Load `http://localhost:3000/`
- Search bar + eye-icon button render side-by-side, matching heights.
- Existing unwatched items render correctly.
- Reordering by drag still works.

- [ ] **Step 5: Mark-watched flow**

- Open an item's detail page from the list.
- Mark it watched.
- You return to `/`; the item is gone from the unwatched list.

- [ ] **Step 6: Watched page**

- Click the eye icon in the home header.
- `/watched` opens with a view-transition animation.
- The item you just watched appears at the top with a "Regardé aujourd'hui" line.
- Tap it → opens the detail page.

- [ ] **Step 7: SSE sync across tabs**

- Open `/` in tab A and `/watched` in tab B.
- In tab A, mark another item watched (via its detail page).
- In tab B, the new item appears at the top without a reload.
- In tab B, the list updates if you unwatch an item via its detail page.

- [ ] **Step 8: Empty state**

- In the dev DB, delete all watched items (or use a fresh DB).
- Load `/watched`.
- Empty-state copy renders: "Rien de regardé pour l'instant."

- [ ] **Step 9: Locale check**

- Switch your browser language to English and reload `/watched`.
- Copy reads "Watched films" / "Watched today" / "Nothing watched yet."

- [ ] **Step 10: Mobile viewport**

- DevTools mobile emulation (≤600px wide):
  - Home header sticks, icon button stays flush with search bar.
  - Fullscreen search overlay works correctly (open, type, cancel).
  - `/watched` page header and list render without horizontal scroll.

- [ ] **Step 11: Ready to ship**

All checks pass? Good. Stop the dev server. Prepare for deploy per the spec's Deployment notes (backup prod DB first).

---

## Out of scope (not in this plan)

- Pagination on `/watched`.
- Search/filter within watched.
- Stats views.
- Unwatch/delete actions directly on the watched page.
- Hero logo on `/watched`.
- Moving the `<template>` out into a shared partial.
