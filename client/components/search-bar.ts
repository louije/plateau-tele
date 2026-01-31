import { searchTmdb } from "../services/api.js";
import { debounce } from "../lib/debounce.js";
import { posterUrl } from "../lib/tmdb-image.js";
import { displayTitle } from "../lib/title.js";
import { t } from "../i18n/index.js";
import type { TmdbSearchResult } from "../../shared/types.js";

export class SearchBar extends HTMLElement {
  private input!: HTMLInputElement;
  private results!: HTMLUListElement;

  connectedCallback() {
    this.innerHTML = `
      <div class="search-bar">
        <div class="search-bar__header">
          <input
            class="search-bar__input"
            type="search"
            placeholder="${t("search.placeholder")}"
            autocomplete="off"
            aria-label="${t("search.ariaLabel")}"
          />
          <button class="search-bar__cancel" type="button">${t("search.cancel")}</button>
        </div>
        <ul class="search-results" role="listbox"></ul>
      </div>
    `;

    this.input = this.querySelector("input")!;
    this.results = this.querySelector(".search-results")!;

    this.input.addEventListener("input", debounce(() => this.onInput(), 300));
    this.input.addEventListener("focus", () => this.activate());
    this.input.addEventListener("keydown", (e) => this.onKeydown(e));
    this.querySelector(".search-bar__cancel")!.addEventListener("click", () => this.deactivate());

    // Restore search from ?q param
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      this.input.value = q;
      this.activate();
      this.onInput();
    }
  }

  private async onInput() {
    const q = this.input.value.trim();
    if (q.length < 2) {
      this.clearResults();
      return;
    }

    const items = await searchTmdb(q);
    this.renderResults(items);
  }

  private onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      this.deactivate();
    }
  }

  private activate() {
    this.querySelector(".search-bar")!.classList.add("is-active");
  }

  private deactivate() {
    this.clearResults();
    this.input.value = "";
    this.input.blur();
    this.querySelector(".search-bar")!.classList.remove("is-active");
  }

  private renderResults(items: TmdbSearchResult[]) {
    const tpl = document.getElementById("search-result-tpl") as HTMLTemplateElement;
    this.results.innerHTML = "";

    for (const item of items) {
      const frag = tpl.content.cloneNode(true) as DocumentFragment;
      const li = frag.querySelector(".search-result")!;
      const link = li.querySelector(".search-result__link") as HTMLAnchorElement;
      const img = li.querySelector(".search-result__poster") as HTMLImageElement;
      const titleEl = li.querySelector(".search-result__title")!;
      const subtitleEl = li.querySelector(".search-result__subtitle")!;
      const meta = li.querySelector(".search-result__meta")!;

      const q = encodeURIComponent(this.input.value.trim());
      link.href = `/detail/${item.mediaType}/${item.id}?q=${q}`;

      const src = posterUrl(item.posterPath, "w92");
      if (src) {
        img.src = src;
        img.style.viewTransitionName = `poster-${item.id}`;
      }

      const { primary, subtitle } = displayTitle(item.title, item.originalTitle, item.originalLanguage);
      titleEl.textContent = primary;
      titleEl.style.viewTransitionName = `title-${item.id}`;

      if (subtitle) subtitleEl.textContent = subtitle;
      else subtitleEl.remove();

      meta.textContent = [
        item.mediaType === "tv" ? t("watchItem.tv") : t("watchItem.movie"),
        item.year,
        item.country,
        item.duration,
        item.director,
      ]
        .filter(Boolean)
        .join(" · ");

      this.results.appendChild(frag);
    }
  }

  private clearResults() {
    this.results.innerHTML = "";
  }
}

customElements.define("search-bar", SearchBar);
