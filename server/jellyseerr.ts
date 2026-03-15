import type { MediaType } from "../shared/types.js";

export type JellyfinStatus = "available" | "requested" | "processing" | "unavailable";

export interface MediaAvailability {
  status: JellyfinStatus;
  requestId: number | null;
}

function config() {
  const url = process.env.JELLYSEERR_URL;
  const key = process.env.JELLYSEERR_API_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

function statusFromCode(code: number): JellyfinStatus {
  // Jellyseerr status codes: 2=PENDING, 3=PROCESSING, 4=PARTIALLY_AVAILABLE, 5=AVAILABLE
  if (code === 5 || code === 4) return "available";
  if (code === 3) return "processing";
  if (code === 2) return "requested";
  return "unavailable";
}

export async function getMediaAvailability(
  tmdbId: number,
  mediaType: MediaType,
): Promise<MediaAvailability> {
  const cfg = config();
  if (!cfg) return { status: "unavailable", requestId: null };

  try {
    const res = await fetch(`${cfg.url}/api/v1/${mediaType}/${tmdbId}`, {
      headers: { "X-Api-Key": cfg.key },
    });
    if (!res.ok) {
      console.warn(`[jellyseerr] availability check failed: ${res.status} for ${mediaType}/${tmdbId}`);
      return { status: "unavailable", requestId: null };
    }

    const data = (await res.json()) as {
      mediaInfo?: {
        status?: number;
        requests?: { id: number; status: number }[];
      };
    };
    if (!data.mediaInfo) return { status: "unavailable", requestId: null };

    const status = statusFromCode(data.mediaInfo.status ?? 1);
    const pendingRequest = data.mediaInfo.requests?.find(
      (r) => r.status === 1 || r.status === 2,
    );
    return { status, requestId: pendingRequest?.id ?? null };
  } catch (e) {
    console.error(`[jellyseerr] availability check error for ${mediaType}/${tmdbId}:`, e);
    return { status: "unavailable", requestId: null };
  }
}

export async function cancelRequest(
  requestId: number,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "Jellyseerr not configured" };

  try {
    const res = await fetch(`${cfg.url}/api/v1/request/${requestId}`, {
      method: "DELETE",
      headers: { "X-Api-Key": cfg.key },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[jellyseerr] cancel failed: ${res.status} for request ${requestId}:`, text);
      return { ok: false, error: text };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[jellyseerr] cancel error for request ${requestId}:`, e);
    return { ok: false, error: String(e) };
  }
}

export async function requestMedia(
  tmdbId: number,
  mediaType: MediaType,
): Promise<{ ok: boolean; error?: string }> {
  const cfg = config();
  if (!cfg) return { ok: false, error: "Jellyseerr not configured" };

  try {
    const body: Record<string, unknown> = { mediaType, mediaId: tmdbId };
    if (mediaType === "tv") body.seasons = "all";

    const res = await fetch(`${cfg.url}/api/v1/request`, {
      method: "POST",
      headers: { "X-Api-Key": cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[jellyseerr] request failed: ${res.status} for ${mediaType}/${tmdbId}:`, text);
      return { ok: false, error: text };
    }
    return { ok: true };
  } catch (e) {
    console.error(`[jellyseerr] request error for ${mediaType}/${tmdbId}:`, e);
    return { ok: false, error: String(e) };
  }
}
