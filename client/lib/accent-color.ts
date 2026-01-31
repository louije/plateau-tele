const SIZE = 8;

export function applyAccentFromImage(img: HTMLImageElement) {
  const apply = () => {
    const color = extractColor(img);
    if (color) {
      document.documentElement.style.setProperty("--color-accent", color);
    }
  };
  if (img.complete && img.naturalWidth) apply();
  else img.addEventListener("load", apply, { once: true });
}

function extractColor(img: HTMLImageElement): string | null {
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
    return `hsl(${Math.round(bestH * 360)} ${Math.round(finalS * 100)}% ${Math.round(finalL * 100)}%)`;
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
