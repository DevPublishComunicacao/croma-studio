import type { Cmyk, Rgb } from "@/lib/types";

export function rgbToCmykApprox(rgb: Rgb): Cmyk {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const k = 1 - Math.max(r, g, b);

  if (k >= 1) {
    return { c: 0, m: 0, y: 0, k: 100 };
  }

  const c = (1 - r - k) / (1 - k);
  const m = (1 - g - k) / (1 - k);
  const y = (1 - b - k) / (1 - k);

  return {
    c: Math.round(c * 100),
    m: Math.round(m * 100),
    y: Math.round(y * 100),
    k: Math.round(k * 100),
  };
}

export function formatCmyk(cmyk: Cmyk, separador = ", "): string {
  const { c, m, y, k } = cmyk;
  return `C: ${c}%${separador}M: ${m}%${separador}Y: ${y}%${separador}K: ${k}%`;
}
