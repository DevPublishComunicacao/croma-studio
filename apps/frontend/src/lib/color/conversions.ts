import type { Lab, Rgb } from "@/lib/types";

const EPSILON = 0.008856;
const KAPPA = 903.3;

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return v;
}

function xyzToLab(x: number, y: number, z: number): Lab {
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;

  const fx = pivotXyz(x / xn);
  const fy = pivotXyz(y / yn);
  const fz = pivotXyz(z / zn);

  return {
    l: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

function labToXyz(lab: Lab): { x: number; y: number; z: number } {
  const xn = 0.95047;
  const yn = 1.0;
  const zn = 1.08883;

  const fy = (lab.l + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;

  return {
    x: xn * unPivotXyz(fx),
    y: yn * unPivotXyz(fy),
    z: zn * unPivotXyz(fz),
  };
}

function pivotXyz(t: number): number {
  return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function unPivotXyz(t: number): number {
  const t3 = t * t * t;
  return t3 > EPSILON ? t3 : (116 * t - 16) / KAPPA;
}

export function rgbToLab(rgb: Rgb): Lab {
  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = 0.0193339 * r + 0.119192 * g + 0.9503041 * b;

  return xyzToLab(x, y, z);
}

export function labToRgb(lab: Lab): Rgb {
  const { x, y, z } = labToXyz(lab);

  const rl = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const gl = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const bl = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;

  const clamp = (v: number) => Math.max(0, Math.min(1, v));

  return {
    r: Math.round(linearToSrgb(clamp(rl)) * 255),
    g: Math.round(linearToSrgb(clamp(gl)) * 255),
    b: Math.round(linearToSrgb(clamp(bl)) * 255),
  };
}

export function rgbToHex(rgb: Rgb): string {
  const toHex = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const parsed = parseInt(
    value.length === 3
      ? value
          .split("")
          .map((c) => c + c)
          .join("")
      : value,
    16,
  );
  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
}

export function labDistance(a: Lab, b: Lab): number {
  const dl = a.l - b.l;
  const da = a.a - b.a;
  const db = a.b - b.b;
  return Math.sqrt(dl * dl + da * da + db * db);
}

export function labChroma(lab: Lab): number {
  return Math.sqrt(lab.a * lab.a + lab.b * lab.b);
}

export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const { l: l1, a: a1, b: b1 } = lab1;
  const { l: l2, a: a2, b: b2 } = lab2;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const CBar = (C1 + C2) / 2;
  const CBar7 = Math.pow(CBar, 7);

  const G =
    0.5 *
    (1 - Math.sqrt(CBar7 / (CBar7 + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const h1p = b1 === 0 && a1p === 0 ? 0 : (Math.atan2(b1, a1p) * 180) / Math.PI;
  const h2p = b2 === 0 && a2p === 0 ? 0 : (Math.atan2(b2, a2p) * 180) / Math.PI;

  const hpBar =
    Math.abs(h1p - h2p) > 180
      ? (h1p + h2p + 360) / 2
      : (h1p + h2p) / 2;

  const deltaLp = l2 - l1;
  const deltaCp = C2p - C1p;

  let deltahp: number;
  if (C1p * C2p === 0) {
    deltahp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    deltahp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    deltahp = h2p - h1p - 360;
  } else {
    deltahp = h2p - h1p + 360;
  }

  const deltaHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((deltahp * Math.PI) / 360);

  const LBarP = (l1 + l2) / 2;
  const CBarP = (C1p + C2p) / 2;

  const T =
    1 -
    0.17 * Math.cos(((hpBar - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hpBar * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hpBar + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * hpBar - 63) * Math.PI) / 180);

  const SL = 1 + (0.015 * (LBarP - 50) * (LBarP - 50)) / Math.sqrt(20 + (LBarP - 50) * (LBarP - 50));
  const SC = 1 + 0.045 * CBarP;
  const SH = 1 + 0.015 * CBarP * T;

  const deltaTheta =
    30 * Math.exp(-Math.pow((hpBar - 275) / 25, 2));

  const CBarP7 = Math.pow(CBarP, 7);
  const RT =
    -2 *
    Math.sqrt(CBarP7 / (CBarP7 + Math.pow(25, 7))) *
    Math.sin((2 * deltaTheta * Math.PI) / 180);

  const LTerm = deltaLp / SL;
  const CTerm = deltaCp / SC;
  const HTerm = deltaHp / SH;

  return Math.sqrt(LTerm * LTerm + CTerm * CTerm + HTerm * HTerm + RT * CTerm * HTerm);
}
