import { NATIVE_LANGUAGES } from "../../shared/config.js";

/**
 * Returns the primary title and an optional subtitle.
 * - If the original language is one we speak, use the original title (or the intl title).
 * - Otherwise, show the original title as primary and the intl title as subtitle.
 */
export function displayTitle(
  title: string,
  originalTitle: string | null,
  originalLanguage: string,
): { primary: string; subtitle: string | null } {
  const isNative = NATIVE_LANGUAGES.includes(originalLanguage);

  if (isNative || !originalTitle) {
    return { primary: originalTitle ?? title, subtitle: null };
  }

  return { primary: originalTitle, subtitle: title };
}
