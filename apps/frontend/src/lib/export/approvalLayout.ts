import type { DominantColor, AnalysisResult } from "@/lib/types";

export type Side = "top" | "bottom" | "left" | "right";

export interface ApprovalLabel {
  x: number;
  y: number;
  w: number;
  h: number;
  targetX: number;
  targetY: number;
  side: Side;
  color: DominantColor;
}

export interface ApprovalPaletteBox {
  color: DominantColor;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ApprovalPalette {
  x: number;
  y: number;
  w: number;
  h: number;
  headerY: number;
  subtitleY: number;
  boxes: ApprovalPaletteBox[];
}

const PALETTE_BOTTOM_PADDING = 2;

export interface ApprovalPageGeometry {
  imgX: number;
  imgY: number;
  imgW: number;
  imgH: number;
  paletteX: number;
  labels: ApprovalLabel[];
}

const TARJA_NATURAL: Record<string, { w: number; h: number }> = {
  "vertical-left": { w: 623, h: 1148 },
  "vertical-right": { w: 621, h: 1148 },
  "horizontal-top": { w: 1148, h: 621 },
  "horizontal-bottom": { w: 1148, h: 621 },
};

export interface TarjaOverlay {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export type PunchType = "ovoid" | "round";

export type PunchPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "middle-left"
  | "middle-center"
  | "middle-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface PunchOverlay {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const PUNCH_MARGIN = 9;

export const PUNCH_PHYSICAL = {
  ovoid: { w: 18, h: 4.5 },
  round: { w: 7.5, h: 7.5 },
} as const;

export function computePunchOverlay(
  type: string | undefined,
  position: string | undefined,
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
  scale = 1,
): PunchOverlay | null {
  if (!type || !position) return null;
  const physical = type === "round" ? PUNCH_PHYSICAL.round : PUNCH_PHYSICAL.ovoid;
  const w = physical.w * scale;
  const h = physical.h * scale;
  const margin = PUNCH_MARGIN * scale;

  let x = imgX + margin;
  let y = imgY + margin;

  if (position.endsWith("-center")) {
    x = imgX + (imgW - w) / 2;
  } else if (position.endsWith("-right")) {
    x = imgX + imgW - w - margin;
  }

  if (position.startsWith("middle")) {
    y = imgY + (imgH - h) / 2;
  } else if (position.startsWith("bottom")) {
    y = imgY + imgH - h - margin;
  }

  return { x, y, w, h };
}

export function computePunchOverlays(
  type: string | undefined,
  position: string | undefined,
  quantity: string | undefined,
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
  scale = 1,
): PunchOverlay[] {
  if (!type || !position) return [];
  if (quantity === "double" && (position === "top-center" || position === "bottom-center")) {
    const physical = type === "round" ? PUNCH_PHYSICAL.round : PUNCH_PHYSICAL.ovoid;
    const w = physical.w * scale;
    const h = physical.h * scale;
    const margin = PUNCH_MARGIN * scale;
    const y = position === "top-center" ? imgY + margin : imgY + imgH - h - margin;
    const leftX = imgX + margin;
    const rightX = imgX + imgW - w - margin;
    return [
      { x: leftX, y, w, h },
      { x: rightX, y, w, h },
    ];
  }
  const single = computePunchOverlay(type, position, imgX, imgY, imgW, imgH, scale);
  return single ? [single] : [];
}

export const CHIP_PHYSICAL = { w: 7.92, h: 5.87 };
export const CHIP_MARGIN = 9;
export const CHIP_PUNCH_GAP = 4;

export const CHIP_DISPLACED_LABEL = "CHIP DESLOCADO DEVIDO A FURAÇÃO";

export interface ChipOverlay {
  x: number;
  y: number;
  w: number;
  h: number;
  displaced: boolean;
}

function rectsIntersect(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

interface ChipOverlayOptions {
  punchScale?: number;
  chipSize?: { w: number; h: number };
  margin?: number;
  gap?: number;
}

export function computeChipOverlay(
  position: string | undefined,
  result: Pick<AnalysisResult, "punchType" | "punchPosition" | "punchQuantity">,
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
  options: ChipOverlayOptions = {},
): ChipOverlay | null {
  if (!position) return null;
  const {
    punchScale = 1,
    chipSize = CHIP_PHYSICAL,
    margin = CHIP_MARGIN,
    gap = CHIP_PUNCH_GAP,
  } = options;
  const w = chipSize.w;
  const h = chipSize.h;
  let x = imgX + margin;
  let y = imgY + margin;
  if (position === "top-right") x = imgX + imgW - w - margin;
  else if (position === "bottom-left") y = imgY + imgH - h - margin;
  else if (position === "bottom-right") {
    x = imgX + imgW - w - margin;
    y = imgY + imgH - h - margin;
  }

  const chip = { x, y, w, h };
  const punches = computePunchOverlays(
    result.punchType,
    result.punchPosition,
    result.punchQuantity,
    imgX,
    imgY,
    imgW,
    imgH,
    punchScale,
  );
  let displaced = false;
  let guard = 0;
  const centerY = imgY + imgH / 2;
  while (guard++ < 20) {
    const conflict = punches.find((p) => rectsIntersect(chip, p));
    if (!conflict) break;
    displaced = true;
    const nextY =
      chip.y + chip.h / 2 < centerY
        ? conflict.y + conflict.h + gap
        : conflict.y - chip.h - gap;
    const clampedY = Math.max(imgY, Math.min(imgY + imgH - chip.h, nextY));
    if (clampedY === chip.y) break;
    chip.y = clampedY;
  }
  return { ...chip, displaced };
}

export function computeTarjaOverlay(
  position: string | undefined,
  imgX: number,
  imgY: number,
  imgW: number,
  imgH: number,
): TarjaOverlay | null {
  if (!position || !TARJA_NATURAL[position]) return null;
  const natural = TARJA_NATURAL[position];
  const src =
    position === "vertical-left"
      ? "/tarja_vertical_esquerda.jpg"
      : position === "vertical-right"
        ? "/tarja_vertical_direita.jpg"
        : position === "horizontal-top"
          ? "/tarja_horizontal_cima.jpg"
          : "/tarja_horizontal_baixo.jpg";
  const vertical = position === "vertical-left" || position === "vertical-right";
  if (vertical) {
    const h = imgH * 1.15;
    const w = h * (natural.w / natural.h);
    const x =
      position === "vertical-left" ? imgX + 4 : imgX + imgW - w - 4;
    const y = imgY + (imgH - h) / 2;
    return { src, x, y, w, h };
  }
  const w = imgW * 1.15;
  const h = w * (natural.h / natural.w);
  const y = position === "horizontal-top" ? imgY + 4 : imgY + imgH - h - 4;
  const x = imgX + (imgW - w) / 2;
  return { src, x, y, w, h };
}

export function chipDisplacedLabelY(
  result: Pick<AnalysisResult, "magneticStripePosition">,
  fitted: { x: number; y: number; width: number; height: number },
  gap = 2,
): number {
  const imageBottom = fitted.y + fitted.height;
  const tarja = computeTarjaOverlay(
    result.magneticStripePosition,
    fitted.x,
    fitted.y,
    fitted.width,
    fitted.height,
  );
  if (!tarja) return imageBottom + gap;
  return Math.max(imageBottom, tarja.y + tarja.h) + gap;
}

export interface ApprovalGeometryParams {
  result: AnalysisResult;
  pageW: number;
  pageH: number;
  margin: number;
  labelW: number;
  labelH: number;
  labelGap: number;
  hasVerso?: boolean;
  imageMarginY?: number;
  paletteW?: number;
  maxImageHeight?: number;
}

export function computeApprovalLabelsForImage({
  result,
  imgX,
  imgY,
  imgW,
  imgH,
  labelW,
  labelH,
  labelGap,
  pageW,
  pageH,
  margin,
}: {
  result: AnalysisResult;
  imgX: number;
  imgY: number;
  imgW: number;
  imgH: number;
  labelW: number;
  labelH: number;
  labelGap: number;
  pageW: number;
  pageH: number;
  margin: number;
}): ApprovalLabel[] {
  const isLongImage = result.imageHeight > result.imageWidth;
  const sides: Record<Side, DominantColor[]> = {
    top: [],
    bottom: [],
    left: [],
    right: [],
  };

  result.colors
    .filter((color) => color.x != null && color.y != null)
    .forEach((color) => {
      const nx = (color.x ?? 0.5) - 0.5;
      const ny = (color.y ?? 0.5) - 0.5;
      const side: Side = isLongImage
        ? nx < 0
          ? "left"
          : "right"
        : Math.abs(nx) > Math.abs(ny)
          ? nx < 0
            ? "left"
            : "right"
          : ny < 0
            ? "top"
            : "bottom";
      sides[side].push(color);
    });

  const labels: ApprovalLabel[] = [];
  (Object.keys(sides) as Side[]).forEach((side) => {
    const colors = sides[side];
    const vertical = side === "left" || side === "right";
    const size = vertical ? labelH : labelW;
    const available = vertical ? imgH : imgW;
    const total = colors.length * size + Math.max(0, colors.length - 1) * labelGap;
    const start = (vertical ? imgY : imgX) + (available - total) / 2;

    colors.forEach((color, index) => {
      const coord = start + index * (size + labelGap);
      labels.push({
        color,
        side,
        targetX: imgX + (color.x ?? 0.5) * imgW,
        targetY: imgY + (color.y ?? 0.5) * imgH,
        x: Math.max(
          margin + 1,
          Math.min(
            pageW - margin - labelW - 1,
            vertical
          ? side === "left"
            ? imgX - labelW - labelGap
            : imgX + imgW + labelGap
              : coord,
          ),
        ),
        y: Math.max(
          margin + 37,
          Math.min(
            pageH - margin - 9 - labelH,
            vertical
          ? coord
          : side === "top"
            ? imgY - labelH
                : imgY + imgH + labelGap,
          ),
        ),
        w: labelW,
        h: labelH,
      });
    });
  });

  return labels;
}

export function computeApprovalPalette({
  colors,
  x,
  y,
  w,
  h,
  headerH = 11,
  boxGap = 1.5,
  cols = 3,
  minBoxH = 16,
  maxBoxH = 18,
}: {
  colors: DominantColor[];
  x: number;
  y: number;
  w: number;
  h: number;
  headerH?: number;
  boxGap?: number;
  cols?: number;
  minBoxH?: number;
  maxBoxH?: number;
}): ApprovalPalette {
  const count = Math.max(1, colors.length);
  const rows = Math.ceil(count / cols);
  const boxW = (w - 2 - (cols - 1) * boxGap) / cols;
  const availH = h - headerH - 2 - PALETTE_BOTTOM_PADDING;
  const boxH = Math.min(
    maxBoxH,
    Math.max(minBoxH, (availH - (rows - 1) * boxGap) / rows),
  );
  const boxes: ApprovalPaletteBox[] = colors.map((color, index) => ({
    color,
    x: x + (index % cols) * (boxW + boxGap),
    y: y + headerH + 2 + Math.floor(index / cols) * (boxH + boxGap),
    w: boxW,
    h: boxH,
  }));
  return {
    x,
    y,
    w,
    h,
    headerY: y + 3,
    subtitleY: y + 6,
    boxes,
  };
}

export function approvalPaletteMinHeight(
  colorCount: number,
  headerH = 11,
  boxGap = 1.5,
  cols = 3,
  minBoxH = 16,
): number {
  const rows = Math.ceil(Math.max(1, colorCount) / cols);
  return headerH + 2 + rows * minBoxH + (rows - 1) * boxGap + PALETTE_BOTTOM_PADDING;
}

export function computeApprovalGeometry({
  result,
  pageW,
  pageH,
  margin,
  labelW,
  labelH,
  labelGap,
  hasVerso = false,
  imageMarginY = 0,
  paletteW = 0,
  maxImageHeight = Number.POSITIVE_INFINITY,
}: ApprovalGeometryParams): ApprovalPageGeometry {
  const bottomZoneTop = pageH - margin - (hasVerso ? 90 : 42);
  const leftZoneRight = margin + labelW + 1;
  const rightZoneLeft = pageW - margin - labelW - 1;
  const paletteX = pageW - margin - paletteW;

  const areaX = margin + 5;
  const areaRight = Math.min(rightZoneLeft - 5, paletteX - 5);
  const areaTop = margin + 37 + 8;
  const areaBottom = bottomZoneTop - 4;
  const areaW = areaRight - areaX;
  const areaH = areaBottom - areaTop;

  const maxH = hasVerso
    ? (pageH - margin - 8 - areaTop - (labelGap + labelH) * 2 - 12) / 2 - (imageMarginY ?? 0) * 2
    : areaH - (imageMarginY ?? 0);

  const naturalW = Math.max(1, result.imageWidth);
  const naturalH = Math.max(1, result.imageHeight);
  const scale = Math.min(areaW / naturalW, maxH / naturalH, maxImageHeight / naturalH);

  const imgW = naturalW * scale;
  const imgH = naturalH * scale;

  const centerX = (areaX + areaRight) / 2;
  const imgX = centerX - imgW / 2;
  const imgY = areaTop + (imageMarginY ?? 0);

  return { imgX, imgY, imgW, imgH, paletteX, labels: [] };
}
