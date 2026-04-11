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
