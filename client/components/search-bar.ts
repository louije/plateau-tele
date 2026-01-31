import { searchTmdb, addItem } from "../services/api.js";
import { debounce } from "../lib/debounce.js";
import { posterUrl } from "../lib/tmdb-image.js";
import type { TmdbSearchResult, WatchItemCreate } from "../../shared/types.js";

export class SearchBar extends HTMLElement {
  private input!: HTMLInputElement;
  private results!: HTMLUListElement;
  private selected: TmdbSearchResult | null = null;

  connectedCallback() {
    this.innerHTML = `
      <div class="search-bar">
        <div class="search-bar__header">
          <input
            class="search-bar__input"
            type="search"
            placeholder="Search movies & shows..."
            autocomplete="off"
            aria-label="Search movies and shows"
          />
          <button class="search-bar__cancel" type="button">Cancel</button>
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
      const img = li.querySelector(".search-result__poster") as HTMLImageElement;
      const title = li.querySelector(".search-result__title")!;
      const meta = li.querySelector(".search-result__meta")!;

      const src = posterUrl(item.posterPath, "w92");
      if (src) img.src = src;
      title.textContent = item.title;
      meta.textContent = [item.mediaType === "tv" ? "TV" : "Movie", item.year]
        .filter(Boolean)
        .join(" · ");

      li.addEventListener("click", () => this.onSelect(item));
      this.results.appendChild(frag);
    }
  }

  private clearResults() {
    this.results.innerHTML = "";
  }

  private onSelect(item: TmdbSearchResult) {
    this.selected = item;
    this.deactivate();
    this.showAddForm(item);
  }

  private showAddForm(item: TmdbSearchResult) {
    const tpl = document.getElementById("add-form-tpl") as HTMLTemplateElement;
    const frag = tpl.content.cloneNode(true) as DocumentFragment;
    const overlay = frag.querySelector(".add-form-overlay")!;
    const form = frag.querySelector(".add-form") as HTMLFormElement;
    const img = form.querySelector(".add-form__poster") as HTMLImageElement;
    const title = form.querySelector(".add-form__title")!;
    const overview = form.querySelector(".add-form__overview")!;

    const src = posterUrl(item.posterPath);
    if (src) img.src = src;
    else img.remove();
    title.textContent = `${item.title}${item.year ? ` (${item.year})` : ""}`;
    overview.textContent = item.overview;

    // Restore last used name
    const lastUser = localStorage.getItem("plateau-user") || "";
    const addedByInput = form.querySelector('input[name="addedBy"]') as HTMLInputElement;
    addedByInput.value = lastUser;

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const note = (fd.get("note") as string).trim();
      const addedBy = (fd.get("addedBy") as string).trim();

      localStorage.setItem("plateau-user", addedBy);

      const payload: WatchItemCreate = {
        tmdbId: item.id,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath,
        year: item.year,
        note,
        addedBy,
      };

      await addItem(payload);
      overlay.remove();
    });

    overlay.querySelector(".btn-cancel")!.addEventListener("click", () => {
      overlay.remove();
    });

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(frag);
    (form.querySelector("textarea") as HTMLTextAreaElement).focus();
  }
}

customElements.define("search-bar", SearchBar);
