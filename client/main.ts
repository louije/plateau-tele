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

  const applyTransform = () => {
    heroImg.style.transform = `translateY(${scrollY * -0.15}px) scale(${pullScale})`;
  };

  window.addEventListener("scroll", applyTransform, { passive: true });

  window.addEventListener("touchstart", (e) => {
    startY = e.touches[0]!.clientY;
  }, { passive: true });

  window.addEventListener("touchmove", (e) => {
    if (scrollY > 0) { pullScale = 1; return; }
    const pull = e.touches[0]!.clientY - startY;
    if (pull <= 0) { pullScale = 1; return; }
    pullScale = 1 + pull * 0.002;
    applyTransform();
  }, { passive: true });

  window.addEventListener("touchend", () => {
    if (pullScale <= 1) return;
    heroImg.style.transition = "transform 0.3s ease-out";
    pullScale = 1;
    applyTransform();
    heroImg.addEventListener("transitionend", () => {
      heroImg.style.transition = "";
    }, { once: true });
  }, { passive: true });
}
