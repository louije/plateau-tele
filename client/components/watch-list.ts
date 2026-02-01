import Sortable from "sortablejs";
import {
  fetchItems,
  reorderItems,
} from "../services/api.js";
import { subscribe } from "../services/events.js";
import { posterUrl } from "../lib/tmdb-image.js";
import { displayTitle } from "../lib/title.js";
import { t } from "../i18n/index.js";
import { applyAccentFromImage } from "../lib/accent-color.js";
import type { WatchItem, SSEEvent, ReorderPayload } from "../../shared/types.js";

export class WatchList extends HTMLElement {
  private list!: HTMLUListElement;
  private items: WatchItem[] = [];
  private sortable: Sortable | null = null;

  connectedCallback() {
    this.innerHTML = `<ul class="watch-list"></ul>`;
    this.list = this.querySelector(".watch-list")!;

    this.load();
    subscribe((event) => this.onSSE(event));
  }

  private async load() {
    this.items = await fetchItems();
    this.render();
  }

  private render() {
    this.sortable?.destroy();
    this.sortable = null;
    this.list.innerHTML = "";

    if (this.items.length === 0) {
      this.list.innerHTML = `<li class="watch-list__empty">${t("watchList.empty")}</li>`;
      return;
    }

    const tpl = document.getElementById("watch-item-tpl") as HTMLTemplateElement;

    for (const item of this.items) {
      const frag = tpl.content.cloneNode(true) as DocumentFragment;
      const li = frag.querySelector(".watch-item") as HTMLLIElement;
      li.dataset.id = String(item.id);

      const link = li.querySelector(".watch-item__link") as HTMLAnchorElement;
      link.href = `/detail/${item.mediaType}/${item.tmdbId}`;

      const img = li.querySelector(".watch-item__poster") as HTMLImageElement;
      const titleEl = li.querySelector(".watch-item__title")!;
      const subtitleEl = li.querySelector(".watch-item__subtitle")!;
      const meta = li.querySelector(".watch-item__meta")!;
      const directorEl = li.querySelector(".watch-item__director")!;
      const note = li.querySelector(".watch-item__note")!;
      const addedByEl = li.querySelector(".watch-item__added-by")!;

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
      if (item.director) {
        const label = item.mediaType === "tv" ? t("detail.creator") : t("detail.director");
        directorEl.textContent = `${label}\u00a0: ${item.director}`;
      } else {
        directorEl.remove();
      }
      note.textContent = item.note || "";
      if (item.addedBy) {
        addedByEl.textContent = item.addedBy;
        addedByEl.style.setProperty("--pill-hue", String(hashHue(item.addedBy)));
      } else {
        addedByEl.remove();
      }

      this.list.appendChild(frag);
    }

    this.initSortable();

    // Accent from first item's poster
    const firstPoster = this.list.querySelector<HTMLImageElement>(".watch-item__poster");
    if (firstPoster) applyAccentFromImage(firstPoster);
  }

  private initSortable() {
    const isTouchDevice = matchMedia("(max-width: 600px)").matches;
    this.sortable = Sortable.create(this.list, {
      animation: 200,
      handle: isTouchDevice ? ".watch-item__handle" : undefined,
      delay: isTouchDevice ? 0 : 300,
      delayOnTouchOnly: true,
      forceFallback: isTouchDevice,
      draggable: ".watch-item",
      ghostClass: "watch-item--ghost",
      chosenClass: "watch-item--chosen",
      dragClass: "watch-item--drag",
      filter: ".watch-item__added-by",
      preventOnFilter: false,
      onEnd: (evt) => {
        const { oldIndex, newIndex } = evt;
        if (oldIndex == null || newIndex == null || oldIndex === newIndex) return;

        const [moved] = this.items.splice(oldIndex, 1);
        if (!moved) return;
        this.items.splice(newIndex, 0, moved);

        const payload: ReorderPayload[] = this.items.map((item, i) => ({
          itemId: item.id,
          newPosition: i,
        }));

        for (let i = 0; i < this.items.length; i++) {
          this.items[i]!.position = i;
        }

        reorderItems(payload);
      },
    });
  }

  // ---- SSE handlers ----

  private onSSE(event: SSEEvent) {
    switch (event.type) {
      case "item:added":
        if (!this.items.find((i) => i.id === event.item.id)) {
          this.items.push(event.item);
          this.items.sort((a, b) => a.position - b.position);
          this.render();
        }
        break;

      case "item:removed":
        this.items = this.items.filter((i) => i.id !== event.itemId);
        this.render();
        break;

      case "item:updated": {
        const idx = this.items.findIndex((i) => i.id === event.item.id);
        if (idx !== -1) this.items[idx] = event.item;
        this.render();
        break;
      }

      case "item:watched":
        this.items = this.items.filter((i) => i.id !== event.item.id);
        this.render();
        break;

      case "item:reordered":
        for (const { id, position } of event.items) {
          const item = this.items.find((i) => i.id === id);
          if (item) item.position = position;
        }
        this.items.sort((a, b) => a.position - b.position);
        this.render();
        break;
    }
  }
}

function hashHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(31, h) + name.charCodeAt(i);
  }
  return ((h % 360) + 360) % 360;
}

customElements.define("watch-list", WatchList);
