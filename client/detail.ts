import { applyAccentFromImage } from "./lib/accent-color.js";

// Dynamic accent from poster
const poster = document.querySelector<HTMLImageElement>(".detail-hero__poster, .add-modal__poster");
if (poster) applyAccentFromImage(poster);

// Restore last used name
const addedByInput = document.querySelector<HTMLInputElement>('input[name="addedBy"]');
if (addedByInput) {
  const lastUser = localStorage.getItem("plateau-user") || "";
  if (lastUser) addedByInput.value = lastUser;
}

// Mark-watched form (detail page)
document.querySelectorAll<HTMLFormElement>(".cta-form").forEach((form) => {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const action = form.dataset.action || "";
    form.querySelectorAll("button").forEach((b) => (b.disabled = true));

    await fetch(action, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ watched: true }),
    });
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
      if (warning) warning.hidden = false;
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
