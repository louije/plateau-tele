import { describe, it, expect } from "bun:test";
import { formatWatchedAt } from "./format-watched-at.js";

// Pin "now" so the relative branches are deterministic.
// 2026-04-12 14:00 local.
const NOW = new Date("2026-04-12T14:00:00").getTime();

function daysAgo(n: number): string {
  // n full days ago at noon, so it's unambiguously "n days" regardless of now's clock time.
  const d = new Date(NOW);
  d.setDate(d.getDate() - n);
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

describe("formatWatchedAt (fr)", () => {
  it("says 'aujourd'hui' for today", () => {
    expect(formatWatchedAt(daysAgo(0), "fr", NOW)).toBe("Regardé aujourd'hui");
  });

  it("says 'hier' for yesterday", () => {
    expect(formatWatchedAt(daysAgo(1), "fr", NOW)).toBe("Regardé hier");
  });

  it("says 'il y a 3 jours' for three days ago", () => {
    expect(formatWatchedAt(daysAgo(3), "fr", NOW)).toBe("Regardé il y a 3 jours");
  });

  it("uses absolute short date (same year) for a week+ ago", () => {
    // Same year as NOW (2026), 14 days before → 2026-03-29
    const result = formatWatchedAt(daysAgo(14), "fr", NOW);
    expect(result.startsWith("Regardé le ")).toBe(true);
    expect(result).not.toMatch(/2026/); // year omitted when it matches NOW
    expect(result).toMatch(/mars/);      // March
  });

  it("includes the year when it differs from NOW", () => {
    // 2025-11-04
    const result = formatWatchedAt("2025-11-04T12:00:00Z", "fr", NOW);
    expect(result.startsWith("Regardé le ")).toBe(true);
    expect(result).toMatch(/2025/);
  });
});

describe("formatWatchedAt (en)", () => {
  it("says 'today'", () => {
    expect(formatWatchedAt(daysAgo(0), "en", NOW)).toBe("Watched today");
  });

  it("says 'yesterday'", () => {
    expect(formatWatchedAt(daysAgo(1), "en", NOW)).toBe("Watched yesterday");
  });

  it("says '3 days ago'", () => {
    expect(formatWatchedAt(daysAgo(3), "en", NOW)).toBe("Watched 3 days ago");
  });

  it("uses absolute same-year format for 14 days ago", () => {
    const result = formatWatchedAt(daysAgo(14), "en", NOW);
    expect(result.startsWith("Watched on ")).toBe(true);
    expect(result).not.toMatch(/2026/);
  });

  it("includes year for a prior-year date", () => {
    const result = formatWatchedAt("2025-11-04T12:00:00Z", "en", NOW);
    expect(result.startsWith("Watched on ")).toBe(true);
    expect(result).toMatch(/2025/);
  });
});
