import { downloadDataUrl } from "@/lib/export/download";
import type { DominantColor } from "@/lib/types";

const SWATCH_SIZE = 160;
const GAP = 20;
const LABEL_SPACE = 34;
const PADDING = 24;

export function renderPalettePng(colors: DominantColor[]): string {
  const n = Math.max(1, colors.length);
  const width = PADDING * 2 + n * SWATCH_SIZE + (n - 1) * GAP;
  const height = PADDING * 2 + SWATCH_SIZE + LABEL_SPACE;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não disponível.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  colors.forEach((color, index) => {
    const x = PADDING + index * (SWATCH_SIZE + GAP);
    const y = PADDING;

    ctx.fillStyle = color.hex;
    ctx.beginPath();
    ctx.roundRect(x, y, SWATCH_SIZE, SWATCH_SIZE, 12);
    ctx.fill();

    ctx.strokeStyle = "#e2e5ea";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x + 0.5, y + 0.5, SWATCH_SIZE - 1, SWATCH_SIZE - 1, 12);
    ctx.stroke();

    const labelY = y + SWATCH_SIZE + 22;

    if (color.name) {
      ctx.fillStyle = "#0f172a";
      ctx.font = "600 17px Inter, Arial, sans-serif";
      ctx.fillText(color.name, x, labelY - 3);
      ctx.fillStyle = "#64748b";
      ctx.font = "15px 'Cascadia Code', Consolas, monospace";
      ctx.fillText(color.hex, x, labelY + 12);
    } else {
      ctx.fillStyle = "#0f172a";
      ctx.font = "600 17px 'Cascadia Code', Consolas, monospace";
      ctx.fillText(color.hex, x, labelY + 6);
    }
  });

  return canvas.toDataURL("image/png");
}

export function exportPalettePng(colors: DominantColor[], fileName: string) {
  const dataUrl = renderPalettePng(colors);
  const base = fileName.replace(/\.[^.]+$/, "") || "paleta";
  downloadDataUrl(dataUrl, `${base}-paleta.png`);
}

export interface PalettePngFace {
  label: string;
  colors: DominantColor[];
}

export function renderCombinedPalettePng(faces: PalettePngFace[]): string {
  const active = faces.filter((f) => f.colors.length > 0);
  if (active.length === 0) throw new Error("Nenhuma cor para exportar.");

  const maxColors = Math.max(...active.map((f) => f.colors.length));
  const n = Math.max(1, maxColors);
  const width = PADDING * 2 + n * SWATCH_SIZE + (n - 1) * GAP;
  const labelHeight = 34;
  const faceGap = 16;
  const height =
    PADDING * 2 +
    active.length * (labelHeight + SWATCH_SIZE + LABEL_SPACE) +
    (active.length - 1) * faceGap;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não disponível.");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  let cursorY = PADDING;
  active.forEach((face) => {
    ctx.fillStyle = "#0f172a";
    ctx.font = "600 20px Inter, Arial, sans-serif";
    ctx.fillText(face.label, PADDING, cursorY + 18);
    cursorY += labelHeight;

    face.colors.forEach((color, index) => {
      const x = PADDING + index * (SWATCH_SIZE + GAP);
      const y = cursorY;

      ctx.fillStyle = color.hex;
      ctx.beginPath();
      ctx.roundRect(x, y, SWATCH_SIZE, SWATCH_SIZE, 12);
      ctx.fill();

      ctx.strokeStyle = "#e2e5ea";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x + 0.5, y + 0.5, SWATCH_SIZE - 1, SWATCH_SIZE - 1, 12);
      ctx.stroke();

      const labelY = y + SWATCH_SIZE + 22;

      if (color.name) {
        ctx.fillStyle = "#0f172a";
        ctx.font = "600 17px Inter, Arial, sans-serif";
        ctx.fillText(color.name, x, labelY - 3);
        ctx.fillStyle = "#64748b";
        ctx.font = "15px 'Cascadia Code', Consolas, monospace";
        ctx.fillText(color.hex, x, labelY + 12);
      } else {
        ctx.fillStyle = "#0f172a";
        ctx.font = "600 17px 'Cascadia Code', Consolas, monospace";
        ctx.fillText(color.hex, x, labelY + 6);
      }
    });

    cursorY += SWATCH_SIZE + LABEL_SPACE + faceGap;
  });

  return canvas.toDataURL("image/png");
}

export function exportCombinedPalettePng(faces: PalettePngFace[], fileName: string) {
  const dataUrl = renderCombinedPalettePng(faces);
  const base = fileName.replace(/\.[^.]+$/, "") || "paleta";
  downloadDataUrl(dataUrl, `${base}-frente-e-verso-paleta.png`);
}
