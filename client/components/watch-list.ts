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
  private dragSrcId: number | null = null;

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

      // Drag events for reordering
      li.addEventListener("dragstart", (e) => this.onDragStart(e, item.id));
      li.addEventListener("dragover", (e) => this.onDragOver(e));
      li.addEventListener("dragenter", (e) => this.onDragEnter(e));
      li.addEventListener("dragleave", (e) => this.onDragLeave(e));
      li.addEventListener("drop", (e) => this.onDrop(e));
      li.addEventListener("dragend", () => this.onDragEnd());

      // Touch-based reorder (long press)
      this.setupTouchDrag(li, item.id);

      this.list.appendChild(frag);
    }

    // Accent from first item's poster
    const firstPoster = this.list.querySelector<HTMLImageElement>(".watch-item__poster");
    if (firstPoster) applyAccentFromImage(firstPoster);
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

  // ---- Drag & drop (desktop) ----

  private onDragStart(e: DragEvent, id: number) {
    this.dragSrcId = id;
    (e.target as HTMLElement).classList.add("dragging");
    e.dataTransfer!.effectAllowed = "move";
  }

  private onDragOver(e: DragEvent) {
    e.preventDefault();
    e.dataTransfer!.dropEffect = "move";
  }

  private onDragEnter(e: DragEvent) {
    const li = (e.target as HTMLElement).closest(".watch-item");
    li?.classList.add("drag-over");
  }

  private onDragLeave(e: DragEvent) {
    const li = (e.target as HTMLElement).closest(".watch-item");
    li?.classList.remove("drag-over");
  }

  private onDrop(e: DragEvent) {
    e.preventDefault();
    const targetLi = (e.target as HTMLElement).closest(".watch-item") as HTMLElement | null;
    if (!targetLi || this.dragSrcId === null) return;

    const targetId = Number(targetLi.dataset.id);
    if (targetId === this.dragSrcId) return;

    this.reorder(this.dragSrcId, targetId);
    targetLi.classList.remove("drag-over");
  }

  private onDragEnd() {
    this.dragSrcId = null;
    this.list.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
  }

  // ---- Touch drag (mobile) ----

  private setupTouchDrag(li: HTMLElement, id: number) {
    let timer: ReturnType<typeof setTimeout>;
    let active = false;

    li.addEventListener(
      "touchstart",
      (e) => {
        timer = setTimeout(() => {
          active = true;
          li.classList.add("dragging");
          this.dragSrcId = id;
        }, 400);
      },
      { passive: true },
    );

    li.addEventListener("touchmove", (e) => {
      if (!active) {
        clearTimeout(timer);
        return;
      }
      e.preventDefault();
      const touch = e.touches[0]!;
      const target = document.elementFromPoint(touch.clientX, touch.clientY);
      const targetLi = target?.closest(".watch-item") as HTMLElement | null;

      // Clear all drag-over
      this.list.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      if (targetLi && targetLi !== li) {
        targetLi.classList.add("drag-over");
      }
    });

    li.addEventListener("touchend", () => {
      clearTimeout(timer);
      if (!active) return;
      active = false;
      li.classList.remove("dragging");

      const over = this.list.querySelector(".drag-over") as HTMLElement | null;
      if (over && this.dragSrcId !== null) {
        const targetId = Number(over.dataset.id);
        this.reorder(this.dragSrcId, targetId);
      }

      this.list.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      this.dragSrcId = null;
    });

    li.addEventListener("touchcancel", () => {
      clearTimeout(timer);
      active = false;
      li.classList.remove("dragging");
      this.list.querySelectorAll(".drag-over").forEach((el) => el.classList.remove("drag-over"));
      this.dragSrcId = null;
    });
  }

  // ---- Reorder logic ----

  private reorder(srcId: number, targetId: number) {
    const srcIdx = this.items.findIndex((i) => i.id === srcId);
    const targetIdx = this.items.findIndex((i) => i.id === targetId);
    if (srcIdx === -1 || targetIdx === -1) return;

    // Move the item in the array
    const [moved] = this.items.splice(srcIdx, 1);
    if (!moved) return;
    this.items.splice(targetIdx, 0, moved);

    // Assign new positions and send to server
    const payload: ReorderPayload[] = this.items.map((item, i) => ({
      itemId: item.id,
      newPosition: i,
    }));

    // Update local positions
    for (let i = 0; i < this.items.length; i++) {
      this.items[i]!.position = i;
    }

    this.render();
    reorderItems(payload);
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
