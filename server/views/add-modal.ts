import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { layout } from "./layout.js";
import { extractYear, formatRuntime, extractDirector } from "./detail.js";
import { t } from "../../shared/i18n/index.js";
import type { Locale } from "../../shared/i18n/index.js";
import { posterUrl } from "../../shared/tmdb-image.js";
import { displayTitle } from "../../client/lib/title.js";
import type { MediaType } from "../../shared/types.js";

export interface AddModalData {
  tmdbData: Record<string, unknown>;
  mediaType: MediaType;
  tmdbId: number;
  locale: Locale;
  searchQuery: string | null;
  users: string[];
}

export function renderAddModal(data: AddModalData): HtmlEscapedString {
  const { tmdbData, mediaType, tmdbId, locale } = data;

  const title = (tmdbData.title || tmdbData.name || "Unknown") as string;
  const originalTitle = (tmdbData.original_title || tmdbData.original_name || null) as string | null;
  const originalLanguage = (tmdbData.original_language || "en") as string;
  const pPath = (tmdbData.poster_path || null) as string | null;
  const year = extractYear(tmdbData);
  const runtime = formatRuntime(tmdbData, mediaType);
  const country = ((tmdbData.origin_country as string[]) ?? [])[0] ?? null;
  const director = extractDirector(tmdbData, mediaType);

  const { primary, subtitle } = displayTitle(title, originalTitle, originalLanguage);
  const pageTitle = `${primary} — plateau-télé`;

  const meta = [
    mediaType === "tv" ? t(locale, "watchItem.tv") : t(locale, "watchItem.movie"),
    year,
    country,
    runtime,
  ].filter(Boolean).join(" · ");

  const qs = data.searchQuery ? `?q=${encodeURIComponent(data.searchQuery)}` : "";
  const detailPath = `/detail/${mediaType}/${String(tmdbId)}${qs}`;

  const body = html`
    <header>
      <nav><a href="${detailPath}" class="back-link">${t(locale, "search.cancel")}</a></nav>
    </header>

    <main class="add-modal layout-wide">
      <div class="add-modal__hero">
        ${pPath
          ? html`<img
              class="add-modal__poster"
              src="${posterUrl(pPath, "w154")}"
              alt=""
              crossorigin="anonymous"
              style="view-transition-name: poster-${String(tmdbId)}"
            />`
          : html`<div class="add-modal__poster" style="background: var(--color-surface-raised)"></div>`}
        <div class="add-modal__info">
          <h2 class="add-modal__title" style="view-transition-name: title-${String(tmdbId)}">${primary}</h2>
          ${subtitle ? html`<p class="add-modal__meta">${subtitle}</p>` : ""}
          <p class="add-modal__meta">${meta}</p>
        </div>
      </div>

      <form class="add-form" data-action="/api/items" data-method="POST">
        <input type="hidden" name="tmdbId" value="${String(tmdbId)}" />
        <input type="hidden" name="mediaType" value="${mediaType}" />
        <input type="hidden" name="title" value="${title}" />
        <input type="hidden" name="originalTitle" value="${originalTitle ?? ""}" />
        <input type="hidden" name="originalLanguage" value="${originalLanguage}" />
        <input type="hidden" name="posterPath" value="${pPath ?? ""}" />
        <input type="hidden" name="year" value="${year ?? ""}" />
        <input type="hidden" name="director" value="${director ?? ""}" />
        <input type="hidden" name="country" value="${country ?? ""}" />
        <input type="hidden" name="duration" value="${runtime ?? ""}" />

        <label>
          <span>${t(locale, "detail.noteLabel")}</span>
          <textarea name="note" rows="3" placeholder="${t(locale, "detail.notePlaceholder")}"></textarea>
        </label>
        ${renderAddedBy(data.users, locale)}

        <p class="add-form__warning">${t(locale, "addModal.emptyWarning")}</p>

        <div class="add-form__buttons">
          <button type="submit" class="btn-cta btn-cta--secondary" data-position="top">
            ${t(locale, "detail.addToTop")}
          </button>
          <button type="submit" class="btn-cta" data-position="end">
            ${t(locale, "detail.addToList")}
          </button>
        </div>
      </form>
    </main>

    <script type="module" src="/detail.js"></script>
  `;

  return layout(locale, pageTitle, body);
}

function renderAddedBy(users: string[], locale: Locale): HtmlEscapedString {
  if (users.length === 0) {
    return html`
      <label>
        <span>${t(locale, "detail.addedByLabel")}</span>
        <input name="addedBy" type="text" required placeholder="${t(locale, "detail.addedByPlaceholder")}" />
      </label>`;
  }

  return html`
    <fieldset class="added-by-toggle">
      <legend>${t(locale, "detail.addedByLabel")}</legend>
      <div class="toggle-group">
        ${users.map(
          (user, i) => html`
            <input type="radio" name="addedBy" id="user-${String(i)}" value="${user}" required />
            <label for="user-${String(i)}">${user}</label>`,
        )}
      </div>
    </fieldset>`;
}
