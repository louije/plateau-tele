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
        if (event.item.watched) {
          // New watch OR re-watch of an already-watched item: remove any existing
          // entry and unshift the fresh one so it lands at the top with the
          // newest watched_at.
          this.items = this.items.filter((i) => i.id !== event.item.id);
          this.items.unshift(event.item);
          this.render();
        } else {
          // Un-watched from elsewhere — drop if present.
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
