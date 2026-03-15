import { applyAccentFromImage } from "./lib/accent-color.js";

// ---- Tunefind soundtrack lazy-load ----

interface TunefindSong { name: string; artists: string }
interface TunefindMovieResult { type: "movie"; slug: string; songs: TunefindSong[] }
interface TunefindShowResult { type: "tv"; slug: string; seasonCount: number }
type TunefindResult = TunefindMovieResult | TunefindShowResult;

const lang = document.documentElement.lang;

async function loadTunefind() {
  const main = document.querySelector<HTMLElement>(".detail-page");
  const section = document.querySelector<HTMLElement>(".tunefind-section");
  if (!main || !section) return;

  const title = main.dataset.tunefindTitle ?? "";
  const type = main.dataset.tunefindType ?? "";
  const year = main.dataset.tunefindYear || "";
  if (!title || (type !== "movie" && type !== "tv")) return;

  const params = new URLSearchParams({ title, type });
  if (year) params.set("year", year);

  try {
    const res = await fetch(`/api/tunefind?${params}`);
    if (!res.ok) return;
    const data = (await res.json()) as TunefindResult;
    if (!data) return;
    renderTunefind(section, data);
  } catch {
    // Tunefind is supplementary — fail silently
  }
}

function renderTunefind(section: HTMLElement, data: TunefindResult) {
  const isEn = lang === "en";
  const tunefindUrl = data.type === "movie"
    ? `https://www.tunefind.com/movie/${data.slug}`
    : `https://www.tunefind.com/show/${data.slug}`;

  const h3 = document.createElement("h3");
  h3.textContent = isEn ? "Soundtrack" : "Bande originale";
  section.appendChild(h3);

  if (data.type === "movie") {
    if (data.songs.length === 0) return;

    const ol = document.createElement("ol");
    ol.className = "tunefind-songs";

    for (const song of data.songs) {
      const li = document.createElement("li");
      li.className = "tunefind-song";

      const a = document.createElement("a");
      a.href = `https://open.spotify.com/search/${encodeURIComponent(`${song.name} ${song.artists}`)}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.className = "tunefind-song__link";

      const nameEl = document.createElement("span");
      nameEl.className = "tunefind-song__name";
      nameEl.textContent = song.name;

      const artistsEl = document.createElement("span");
      artistsEl.className = "tunefind-song__artists";
      artistsEl.textContent = song.artists;

      a.append(nameEl, artistsEl);
      li.appendChild(a);
      ol.appendChild(li);
    }

    section.appendChild(ol);
  } else {
    const meta = document.createElement("p");
    meta.className = "tunefind-meta";
    meta.textContent = isEn
      ? `${data.seasonCount} season${data.seasonCount !== 1 ? "s" : ""}`
      : `${data.seasonCount} saison${data.seasonCount !== 1 ? "s" : ""}`;
    section.appendChild(meta);
  }

  const link = document.createElement("a");
  link.href = tunefindUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "tunefind-link";
  link.textContent = isEn ? "View on Tunefind \u2197" : "Voir sur Tunefind \u2197";
  section.appendChild(link);

  section.hidden = false;
}

loadTunefind();

// Dynamic accent from poster
const poster = document.querySelector<HTMLImageElement>(".detail-hero__poster, .add-modal__poster");
if (poster) applyAccentFromImage(poster);

// Restore last used name
const lastUser = localStorage.getItem("plateau-user") || "";
if (lastUser) {
  const textInput = document.querySelector<HTMLInputElement>('input[name="addedBy"][type="text"]');
  if (textInput) {
    textInput.value = lastUser;
  } else {
    const radio = document.querySelector<HTMLInputElement>(`input[name="addedBy"][value="${CSS.escape(lastUser)}"]`);
    if (radio) radio.checked = true;
  }
}

// CTA forms (mark-watched / remove) — two-step confirm
const ctaForms = document.querySelectorAll<HTMLFormElement>(".cta-form");

function resetCta(form: HTMLFormElement) {
  const btn = form.querySelector("button")!;
  if (btn.dataset.originalText) {
    btn.textContent = btn.dataset.originalText;
    delete btn.dataset.originalText;
  }
}

ctaForms.forEach((form) => {
  let confirmed = false;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = form.querySelector("button")!;

    if (!confirmed) {
      confirmed = true;
      // Reset other CTA buttons
      ctaForms.forEach((f) => { if (f !== form) resetCta(f); });
      // Lock width then swap text
      button.dataset.originalText = button.textContent!.trim();
      button.style.minWidth = `${button.offsetWidth}px`;
      button.textContent = button.dataset.confirm || "?";
      return;
    }

    const action = form.dataset.action || "";
    const method = form.dataset.method || "PATCH";
    form.querySelectorAll("button").forEach((b) => (b.disabled = true));

    const options: RequestInit = { method };
    if (method === "PATCH") {
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify({ watched: true });
    }

    await fetch(action, options);
    window.location.href = "/";
  });
});

// Jellyseerr request button
function attachRequestHandler(btn: HTMLButtonElement) {
  const originalText = btn.textContent!.trim();

  btn.addEventListener("click", async () => {
    btn.classList.remove("btn-request--error");
    btn.textContent = originalText;
    btn.disabled = true;

    const tmdbId = Number(btn.dataset.tmdbId);
    const mediaType = btn.dataset.mediaType;

    try {
      const res = await fetch("/api/jellyseerr/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tmdbId, mediaType }),
      });

      if (res.ok) {
        btn.classList.remove("btn-cta--secondary");
        btn.classList.add("btn-request--done");
        btn.textContent = document.documentElement.lang === "en"
          ? "Requested" : "Téléchargement demandé";
      } else {
        btn.disabled = false;
        btn.classList.add("btn-request--error");
        btn.textContent = document.documentElement.lang === "en"
          ? "Request failed \u2014 try again" : "\u00c9chec \u2014 r\u00e9essayer";
      }
    } catch {
      btn.disabled = false;
      btn.classList.add("btn-request--error");
      btn.textContent = document.documentElement.lang === "en"
        ? "Request failed \u2014 try again" : "\u00c9chec \u2014 r\u00e9essayer";
    }
  });
}

const requestBtn = document.querySelector<HTMLButtonElement>(".btn-request");
if (requestBtn) attachRequestHandler(requestBtn);

// Jellyseerr cancel-request button
const cancelBtn = document.querySelector<HTMLButtonElement>(".btn-cancel-request");
if (cancelBtn) {
  cancelBtn.addEventListener("click", async () => {
    cancelBtn.disabled = true;
    cancelBtn.classList.remove("btn-cancel-request--error");

    const requestId = cancelBtn.dataset.requestId;

    try {
      const res = await fetch(`/api/jellyseerr/request/${requestId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        // Replace the availability row with the "Request download" button
        const row = cancelBtn.closest(".availability-row");
        if (row) {
          const tmdbId = cancelBtn.dataset.tmdbId;
          const mediaType = cancelBtn.dataset.mediaType;
          const btn = document.createElement("button");
          btn.className = "btn-cta btn-cta--secondary btn-request";
          btn.dataset.tmdbId = tmdbId!;
          btn.dataset.mediaType = mediaType!;
          btn.textContent = document.documentElement.lang === "en"
            ? "Request download" : "Demander le téléchargement";
          row.replaceWith(btn);
          // Re-attach the request handler on the new button
          attachRequestHandler(btn);
        }
      } else {
        cancelBtn.disabled = false;
        cancelBtn.classList.add("btn-cancel-request--error");
        cancelBtn.textContent = document.documentElement.lang === "en"
          ? "Cancel failed \u2014 try again" : "\u00c9chec \u2014 r\u00e9essayer";
      }
    } catch {
      cancelBtn.disabled = false;
      cancelBtn.classList.add("btn-cancel-request--error");
      cancelBtn.textContent = document.documentElement.lang === "en"
        ? "Cancel failed \u2014 try again" : "\u00c9chec \u2014 r\u00e9essayer";
    }
  });
}

// Add-to-list form (add modal page)
const addForm = document.querySelector<HTMLFormElement>(".add-form");
if (addForm) {
  let warnedOnce = false;
  const warning = addForm.querySelector<HTMLElement>(".add-form__warning");

  addForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const button = e.submitter as HTMLButtonElement;
    const fd = new FormData(addForm);
    const note = (fd.get("note") as string).trim();
    const addedBy = (fd.get("addedBy") as string).trim();

    if (!note && !warnedOnce) {
      warnedOnce = true;
      if (warning) warning.classList.add("is-visible");
      return;
    }

    localStorage.setItem("plateau-user", addedBy);
    addForm.querySelectorAll("button").forEach((b) => (b.disabled = true));

    const payload: Record<string, unknown> = {
      tmdbId: Number(fd.get("tmdbId")),
      mediaType: fd.get("mediaType"),
      title: fd.get("title"),
      originalTitle: fd.get("originalTitle") || null,
      originalLanguage: fd.get("originalLanguage"),
      posterPath: fd.get("posterPath") || null,
      year: fd.get("year") || null,
      note,
      addedBy,
      director: fd.get("director") || null,
      country: fd.get("country") || null,
      duration: fd.get("duration") || null,
    };

    if (button.dataset.position === "top") {
      payload.addToTop = true;
    }

    await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    window.location.href = "/";
  });
}
