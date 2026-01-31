const IMAGE_BASE = "https://image.tmdb.org/t/p";

export function posterUrl(path: string | null, size = "w154"): string {
  if (!path) return "";
  return `${IMAGE_BASE}/${size}${path}`;
}

export function profileUrl(path: string | null, size = "w185"): string {
  if (!path) return "";
  return `${IMAGE_BASE}/${size}${path}`;
}
