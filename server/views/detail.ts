import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { layout } from "./layout.js";
import { t } from "../../shared/i18n/index.js";
import type { Locale } from "../../shared/i18n/index.js";
import { posterUrl, profileUrl } from "../../shared/tmdb-image.js";
import { displayTitle } from "../../client/lib/title.js";
import type { MediaType } from "../../shared/types.js";
import type { MediaAvailability } from "../jellyseerr.js";


interface CastMember {
  name: string;
  character: string;
  profilePath: string | null;
}

interface ExistingItem {
  id: number;
  watched: boolean;
}

interface WatchProvider {
  name: string;
  logoPath: string;
}

export interface DetailPageData {
  tmdbData: Record<string, unknown>;
  mediaType: MediaType;
  tmdbId: number;
  existingItem: ExistingItem | null;
  locale: Locale;
  searchQuery: string | null;
  availability: MediaAvailability;
}

export function renderDetailPage(data: DetailPageData): HtmlEscapedString {
  const { tmdbData, mediaType, tmdbId, existingItem, locale } = data;

  const title = (tmdbData.title || tmdbData.name || "Unknown") as string;
  const originalTitle = (tmdbData.original_title || tmdbData.original_name || null) as string | null;
  const originalLanguage = (tmdbData.original_language || "en") as string;
  const overview = (tmdbData.overview || "") as string;
  const pPath = (tmdbData.poster_path || null) as string | null;
  const year = extractYear(tmdbData);
  const runtime = formatRuntime(tmdbData, mediaType);
  const country = ((tmdbData.origin_country as string[]) ?? [])[0] ?? null;
  const director = extractDirector(tmdbData, mediaType);
  const cast = extractCast(tmdbData);

  const { primary, subtitle } = displayTitle(title, originalTitle, originalLanguage);
  const pageTitle = `${primary}${year ? ` (${year})` : ""} — plateau-télé`;

  const directorLabel = mediaType === "tv"
    ? t(locale, "detail.creator")
    : t(locale, "detail.director");

  const meta = [
    mediaType === "tv" ? t(locale, "watchItem.tv") : t(locale, "watchItem.movie"),
    year,
    country,
    runtime,
  ].filter(Boolean).join(" · ");

  const { searchQuery } = data;
  const qs = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : "";
  const backHref = searchQuery ? `/${qs}` : null;

  const body = html`
    <header>
      <nav>
        <a href="${backHref || "/"}" class="back-link">${searchQuery || t(locale, "detail.home")}</a>
        <a href="/chat" class="chat-link" aria-label="Chat">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </a>
      </nav>
    </header>

    <main class="detail-page layout-wide">
      <div class="detail-hero">
        ${pPath
          ? html`<img
              class="detail-hero__poster"
              src="${posterUrl(pPath, "w342")}"
              alt=""
              crossorigin="anonymous"
              style="view-transition-name: poster-${String(tmdbId)}"
            />`
          : html`<div class="detail-hero__poster detail-hero__poster--empty"></div>`}
        <div class="detail-hero__info">
          <h2 class="detail-hero__title" style="view-transition-name: title-${String(tmdbId)}">${primary}</h2>
          ${subtitle ? html`<p class="detail-hero__subtitle">${subtitle}</p>` : ""}
          <p class="detail-hero__meta">${meta}</p>
          ${director ? html`<p class="detail-hero__director">${directorLabel}${raw("&nbsp;: ")}${director}</p>` : ""}
          <div class="detail-hero__links">
            <a href="${`callsheet://open/${mediaType}/${String(tmdbId)}`}" class="btn-callsheet">
              ${t(locale, "detail.openInCallSheet")}${raw("&nbsp;↗")}
            </a>
            <span class="detail-hero__links-sep" aria-hidden="true">·</span>
            <a href="${`https://www.tunefind.com/search/site?q=${encodeURIComponent(year ? `${title} ${year}` : title)}`}" class="btn-callsheet" target="_blank" rel="noopener noreferrer">
              Tunefind${raw("&nbsp;↗")}
            </a>
          </div>
          ${renderCTA(data, qs)}
        </div>
      </div>

      ${overview ? html`<p class="detail-overview">${overview}</p>` : ""}

      ${renderWatchProviders(tmdbData, data)}

      ${cast.length > 0
        ? html`
          <section class="detail-cast">
            <h3>${t(locale, "detail.cast")}</h3>
            <ul class="cast-list">
              ${cast.map(
                (m) => html`
                  <li class="cast-member">
                    ${m.profilePath
                      ? html`<img class="cast-member__photo" src="${profileUrl(m.profilePath)}" alt="" loading="lazy" />`
                      : html`<div class="cast-member__photo cast-member__photo--empty"></div>`}
                    <span class="cast-member__name">${m.name}</span>
                    <span class="cast-member__role">${m.character}</span>
                  </li>`,
              )}
            </ul>
          </section>`
        : ""}

    </main>

    <script type="module" src="/detail.js"></script>
  `;

  return layout(locale, pageTitle, body);
}

function renderCTA(data: DetailPageData, qs: string): HtmlEscapedString {
  const { mediaType, tmdbId, existingItem, locale } = data;

  if (existingItem && existingItem.watched) {
    return html`<p class="cta-status cta-status--done">${t(locale, "detail.alreadyWatched")}</p>`;
  }

  if (existingItem) {
    return html`
      <div class="cta-buttons">
        <form class="cta-form" data-action="/api/items/${String(existingItem.id)}" data-method="PATCH">
          <button type="submit" class="btn-cta btn-cta--watched" data-confirm="${t(locale, "detail.watchedConfirm")}">
            ${t(locale, "detail.markWatched")}
          </button>
        </form>
        <form class="cta-form" data-action="/api/items/${String(existingItem.id)}" data-method="DELETE">
          <button type="submit" class="btn-cta btn-cta--danger" data-confirm="${t(locale, "detail.removeConfirm")}">
            ${t(locale, "detail.removeFromList")}
          </button>
        </form>
      </div>`;
  }

  return html`
    <a href="${`/detail/${mediaType}/${String(tmdbId)}/add${qs}`}" class="btn-cta">
      ${t(locale, "detail.addToList")}
    </a>`;
}

function renderWatchProviders(tmdbData: Record<string, unknown>, data: DetailPageData): HtmlEscapedString {
  const { availability, mediaType, tmdbId, locale } = data;
  const providers = extractWatchProviders(tmdbData);
  const hasProviders = providers.flatrate.length > 0 || providers.buy.length > 0;
  const hasAvailability = availability.status !== "unavailable";
  const hasRequest = !hasAvailability;

  if (!hasProviders && !hasAvailability && !hasRequest) return html``;

  return html`
    <section class="watch-providers">
      <h3>${t(locale, "detail.watchProviders")}</h3>
      ${availability.status === "available"
        ? html`<p class="availability availability--available">${t(locale, "detail.availableOnJellyfin")}</p>`
        : availability.status === "requested" || availability.status === "processing"
          ? html`
            <div class="availability-row">
              <p class="availability availability--requested">${t(locale, "detail.requested")}</p>
              ${availability.requestId
                ? html`<button class="btn-cancel-request" data-request-id="${String(availability.requestId)}"
                    data-tmdb-id="${String(tmdbId)}" data-media-type="${mediaType}">
                    ${t(locale, "detail.cancelRequest")}
                  </button>`
                : ""}
            </div>`
          : html`
            <button class="btn-cta btn-cta--secondary btn-request"
              data-tmdb-id="${String(tmdbId)}" data-media-type="${mediaType}">
              ${t(locale, "detail.requestDownload")}
            </button>`}
      ${providers.flatrate.length > 0
        ? html`
          <div class="provider-row">
            <span class="provider-row__label">${t(locale, "detail.streaming")}</span>
            <ul class="provider-list">
              ${providers.flatrate.map((p) => html`
                <li class="provider" title="${p.name}">
                  <img class="provider__logo" src="https://image.tmdb.org/t/p/w45${p.logoPath}" alt="${p.name}" />
                </li>`)}
            </ul>
          </div>`
        : ""}
      ${providers.buy.length > 0
        ? html`
          <div class="provider-row">
            <span class="provider-row__label">${t(locale, "detail.buy")}</span>
            <ul class="provider-list">
              ${providers.buy.map((p) => html`
                <li class="provider" title="${p.name}">
                  <img class="provider__logo" src="https://image.tmdb.org/t/p/w45${p.logoPath}" alt="${p.name}" />
                </li>`)}
            </ul>
          </div>`
        : ""}
    </section>`;
}

function extractWatchProviders(data: Record<string, unknown>): { flatrate: WatchProvider[]; buy: WatchProvider[] } {
  const wp = data["watch/providers"] as { results?: Record<string, { flatrate?: { provider_name: string; logo_path: string }[]; buy?: { provider_name: string; logo_path: string }[] }> } | undefined;
  const fr = wp?.results?.FR;
  if (!fr) return { flatrate: [], buy: [] };

  const flatrate = (fr.flatrate ?? []).map((p) => ({ name: p.provider_name, logoPath: p.logo_path }));
  const buy = (fr.buy ?? []).slice(0, 5).map((p) => ({ name: p.provider_name, logoPath: p.logo_path }));
  return { flatrate, buy };
}

export function extractYear(data: Record<string, unknown>): string | null {
  const date = (data.release_date || data.first_air_date) as string | undefined;
  return date ? date.slice(0, 4) : null;
}

export function formatRuntime(data: Record<string, unknown>, mediaType: MediaType): string | null {
  const minutes = mediaType === "movie"
    ? (data.runtime as number | null)
    : ((data.episode_run_time as number[]) ?? [])[0];
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`;
}

export function extractDirector(data: Record<string, unknown>, mediaType: MediaType): string | null {
  if (mediaType === "movie") {
    const credits = data.credits as { crew?: { job: string; name: string }[] } | undefined;
    return credits?.crew?.find((c) => c.job === "Director")?.name ?? null;
  }
  const creators = data.created_by as { name: string }[] | undefined;
  return creators?.[0]?.name ?? null;
}

function extractCast(data: Record<string, unknown>): CastMember[] {
  const credits = data.credits as {
    cast?: { name: string; character: string; profile_path: string | null; order: number }[];
  } | undefined;
  if (!credits?.cast) return [];
  return credits.cast
    .sort((a, b) => a.order - b.order)
    .slice(0, 15)
    .map((c) => ({ name: c.name, character: c.character, profilePath: c.profile_path }));
}
