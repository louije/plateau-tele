import { applyAccentFromImage } from "./lib/accent-color.js";

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
