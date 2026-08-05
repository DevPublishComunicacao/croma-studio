import type { Cmyk, Rgb } from "@/lib/types";

function clampChannel(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function cmykToDisplayRgb(cmyk: Cmyk): Rgb {
  const c = clampChannel(cmyk.c / 100);
  const m = clampChannel(cmyk.m / 100);
  const y = clampChannel(cmyk.y / 100);
  const k = clampChannel(cmyk.k / 100);

  return {
    r: 255 * (1 - c) * (1 - k),
    g: 255 * (1 - m) * (1 - k),
    b: 255 * (1 - y) * (1 - k),
  };
}

// Keep the source data unchanged while making the on-screen artwork closer to ink.
export const CMYK_DISPLAY_FILTER = "saturate(0.58) contrast(0.94) brightness(0.9)";

export function imageDataToCmykDisplayDataUrl(imageData: ImageData): string {
  const source = document.createElement("canvas");
  source.width = imageData.width;
  source.height = imageData.height;
  const sourceContext = source.getContext("2d");
  if (!sourceContext) throw new Error("Canvas não disponível.");
  sourceContext.putImageData(imageData, 0, 0);

  const display = document.createElement("canvas");
  display.width = imageData.width;
  display.height = imageData.height;
  const displayContext = display.getContext("2d");
  if (!displayContext) throw new Error("Canvas não disponível.");
  displayContext.drawImage(source, 0, 0);
  return display.toDataURL("image/png");
}
