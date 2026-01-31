import { t as sharedT, resolveLocale } from "../../shared/i18n/index.js";
import type { Locale, TranslationKey } from "../../shared/i18n/index.js";

let current: Locale = "fr";

export function t(key: TranslationKey): string {
  return sharedT(current, key);
}

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}
