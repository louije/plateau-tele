import { describe, it, expect } from "bun:test";
import { posterUrl, profileUrl } from "../../shared/tmdb-image.js";
import { t, resolveLocale } from "../../shared/i18n/index.js";
import { displayTitle } from "../../client/lib/title.js";
import { debounce } from "../../client/lib/debounce.js";
import { extractYear, formatRuntime } from "../views/detail.js";

describe("posterUrl", () => {
  it("builds URL with default size", () => {
    expect(posterUrl("/abc.jpg")).toBe("https://image.tmdb.org/t/p/w154/abc.jpg");
  });

  it("returns empty string for null path", () => {
    expect(posterUrl(null)).toBe("");
  });

  it("accepts custom size", () => {
    expect(posterUrl("/abc.jpg", "w342")).toBe("https://image.tmdb.org/t/p/w342/abc.jpg");
  });
});

describe("profileUrl", () => {
  it("builds URL with default size", () => {
    expect(profileUrl("/abc.jpg")).toBe("https://image.tmdb.org/t/p/w185/abc.jpg");
  });

  it("returns empty string for null path", () => {
    expect(profileUrl(null)).toBe("");
  });
});

describe("t", () => {
  it("returns English string", () => {
    expect(t("en", "detail.back")).toBe("Back");
  });

  it("returns French string", () => {
    expect(t("fr", "detail.back")).toBe("Retour");
  });
});

describe("resolveLocale", () => {
  it("resolves fr from fr-FR", () => {
    expect(resolveLocale("fr-FR")).toBe("fr");
  });

  it("resolves en from en-US", () => {
    expect(resolveLocale("en-US")).toBe("en");
  });

  it("defaults to fr for unknown language", () => {
    expect(resolveLocale("ja")).toBe("fr");
  });

  it("defaults to fr for empty string", () => {
    expect(resolveLocale("")).toBe("fr");
  });
});

describe("displayTitle", () => {
  it("returns title as primary for native language", () => {
    expect(displayTitle("Fight Club", "Fight Club", "en")).toEqual({
      primary: "Fight Club",
      subtitle: null,
    });
  });

  it("returns title when originalTitle is null", () => {
    expect(displayTitle("Fight Club", null, "en")).toEqual({
      primary: "Fight Club",
      subtitle: null,
    });
  });

  it("shows original as primary and translation as subtitle for foreign films", () => {
    expect(displayTitle("Parasite", "기생충", "ko")).toEqual({
      primary: "기생충",
      subtitle: "Parasite",
    });
  });

  it("treats French as native language", () => {
    expect(displayTitle("Intouchables", "Intouchables", "fr")).toEqual({
      primary: "Intouchables",
      subtitle: null,
    });
  });
});

describe("extractYear", () => {
  it("extracts year from release_date", () => {
    expect(extractYear({ release_date: "1999-10-15" })).toBe("1999");
  });

  it("extracts year from first_air_date", () => {
    expect(extractYear({ first_air_date: "2008-01-20" })).toBe("2008");
  });

  it("returns null when no date", () => {
    expect(extractYear({})).toBeNull();
  });
});

describe("formatRuntime", () => {
  it("formats movie runtime with hours and minutes", () => {
    expect(formatRuntime({ runtime: 139 }, "movie")).toBe("2h19");
  });

  it("formats short movie as minutes only", () => {
    expect(formatRuntime({ runtime: 45 }, "movie")).toBe("45min");
  });

  it("formats exact hours without minutes", () => {
    expect(formatRuntime({ runtime: 120 }, "movie")).toBe("2h");
  });

  it("formats TV episode runtime", () => {
    expect(formatRuntime({ episode_run_time: [47] }, "tv")).toBe("47min");
  });

  it("returns null when no runtime data", () => {
    expect(formatRuntime({}, "movie")).toBeNull();
  });

  it("returns null for zero runtime", () => {
    expect(formatRuntime({ runtime: 0 }, "movie")).toBeNull();
  });
});

describe("debounce", () => {
  it("delays execution", async () => {
    let called = 0;
    const fn = debounce(() => { called++; }, 50);
    fn();
    expect(called).toBe(0);
    await new Promise((r) => setTimeout(r, 100));
    expect(called).toBe(1);
  });

  it("resets timer on repeated calls", async () => {
    let called = 0;
    const fn = debounce(() => { called++; }, 50);
    fn();
    await new Promise((r) => setTimeout(r, 30));
    fn();
    await new Promise((r) => setTimeout(r, 30));
    expect(called).toBe(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(called).toBe(1);
  });
});
