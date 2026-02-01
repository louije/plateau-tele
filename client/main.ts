import "./components/search-bar.js";
import "./components/watch-list.js";
import { connect } from "./services/events.js";
import { getLocale } from "./i18n/index.js";

document.documentElement.lang = getLocale();
connect();

// Subtle parallax on hero image
const heroImg = document.querySelector<HTMLImageElement>(".hero__logo");
if (heroImg) {
  window.addEventListener("scroll", () => {
    heroImg.style.transform = `translateY(${scrollY * -0.15}px)`;
  }, { passive: true });
}
