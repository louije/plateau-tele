import en from "./en.js";
import fr from "./fr.js";

export type Locale = "en" | "fr";
export type TranslationKey = keyof typeof en;

const locales: Record<Locale, typeof en> = { en, fr };

export function t(locale: Locale, key: TranslationKey): string {
  return locales[locale][key];
}

export function resolveLocale(langHint: string): Locale {
  const lang = langHint.slice(0, 2);
  return lang in locales ? (lang as Locale) : "en";
}
