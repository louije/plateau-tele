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
