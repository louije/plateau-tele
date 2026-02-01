import "./components/search-bar.js";
import "./components/watch-list.js";
import { connect } from "./services/events.js";
import { getLocale } from "./i18n/index.js";

document.documentElement.lang = getLocale();
connect();

// Subtle parallax on hero image + overscroll scale
const heroImg = document.querySelector<HTMLImageElement>(".hero__logo");
if (heroImg) {
  let pullScale = 1;
  let startY = 0;

  window.addEventListener("touchstart", (e) => {
    heroImg.style.transition = "";
    startY = e.touches[0]!.clientY;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (scrollY > 0) { pullScale = 1; return; }
    const pull = e.touches[0]!.clientY - startY;
    if (pull <= 0) { pullScale = 1; return; }
    pullScale = 1 + pull * 0.002;
    heroImg.style.scale = String(pullScale);
  }, { passive: true });

  window.addEventListener("touchend", () => {
    if (pullScale <= 1) return;
    heroImg.style.transition = "scale 0.3s ease-out";
    pullScale = 1;
    heroImg.style.scale = "1";
    heroImg.addEventListener("transitionend", () => {
      heroImg.style.transition = "";
    }, { once: true });
  }, { passive: true });
}
