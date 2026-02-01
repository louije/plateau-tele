const SIZE = 8;

export function applyAccentFromImage(img: HTMLImageElement) {
  const apply = () => {
    const result = extractColor(img);
    if (result) {
      document.documentElement.style.setProperty("--color-accent", result.color);
      document.documentElement.style.setProperty(
        "--color-accent-text",
        result.contrastOnWhite >= result.contrastOnBlack ? "white" : "black",
      );
    }
  };
  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener("load", apply, { once: true });
}

interface AccentResult {
  color: string;
  contrastOnWhite: number;
  contrastOnBlack: number;
}

function extractColor(img: HTMLImageElement): AccentResult | null {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(img, 0, 0, SIZE, SIZE);
    const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

    let bestSat = 0;
    let bestH = 0;
    let bestS = 0;
    let bestL = 0;

    for (let i = 0; i < data.length; i += 4) {
      const [h, s, l] = rgbToHsl(data[i]!, data[i + 1]!, data[i + 2]!);
      if (s > bestSat && l > 0.15 && l < 0.85) {
        bestSat = s;
        bestH = h;
        bestS = s;
        bestL = l;
      }
    }

    if (bestSat < 0.1) return null;

    // Ensure enough saturation and lightness for a dark UI accent
    const finalS = Math.max(bestS, 0.5);
    const finalL = Math.min(Math.max(bestL, 0.45), 0.6);
    const color = `hsl(${Math.round(bestH * 360)} ${Math.round(finalS * 100)}% ${Math.round(finalL * 100)}%)`;

    // Compute relative luminance of the final color for contrast check
    const [r, g, b] = hslToRgb(bestH, finalS, finalL);
    const lum = relativeLuminance(r, g, b);

    return {
      color,
      contrastOnWhite: contrastRatio(lum, 1),
      contrastOnBlack: contrastRatio(lum, 0),
    };
  } catch {
    return null;
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }

  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
}

function relativeLuminance(r: number, g: number, b: number): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(lum1: number, lum2: number): number {
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}
