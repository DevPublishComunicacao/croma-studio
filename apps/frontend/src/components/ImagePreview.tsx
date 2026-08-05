"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EyedropperIcon } from "@/components/EyedropperIcon";
import { rgbToCmykApprox } from "@/lib/color/cmykApprox";
import { rgbToHex } from "@/lib/color/conversions";
import {
  CHIP_DISPLACED_LABEL,
  computeChipOverlay,
  PUNCH_MARGIN,
  PUNCH_PHYSICAL,
} from "@/lib/export/approvalLayout";
import type { Cmyk, DominantColor, LoadedImage, PickerMode, Rgb } from "@/lib/types";

export interface PickedColor {
  rgb: Rgb;
  hex: string;
  cmyk: Cmyk | null;
  x: number;
  y: number;
}

interface ImagePreviewProps {
  image: LoadedImage;
  magneticStripePosition?: string | null;
  chipPosition?: string | null;
  punchType?: string | null;
  punchPosition?: string | null;
  punchQuantity?: string | null;
  pickerMode: PickerMode | null;
  savedColors?: DominantColor[];
  onTogglePicker: (mode: PickerMode) => void;
  onPick: (color: PickedColor) => void;
}

interface HoverState {
  screenX: number;
  screenY: number;
  color: PickedColor;
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
}

const MAGNIFIER_ZOOM = 5;

function cmykLabel(color: PickedColor): string {
  const cmyk = color.cmyk ?? rgbToCmykApprox(color.rgb);
  return `C:${cmyk.c} M:${cmyk.m} Y:${cmyk.y} K:${cmyk.k}`;
}

export function ImagePreview({
  image,
  magneticStripePosition,
  chipPosition,
  punchType,
  punchPosition,
  punchQuantity,
  pickerMode,
  savedColors = [],
  onTogglePicker,
  onPick,
}: ImagePreviewProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const [imgDisplayWidth, setImgDisplayWidth] = useState(0);
  const [imgDisplayHeight, setImgDisplayHeight] = useState(0);
  const pickerActive = pickerMode !== null;
  const isBlankRecipient = image.fileName.endsWith("-recipiente.png");
  const chipMarginMm = image.height > image.width ? 9 : 13.5;

  const CARD_WIDTH_MM = 85.5;
  const punchDisplayScale = imgDisplayWidth > 0 ? imgDisplayWidth / CARD_WIDTH_MM : 0;
  const punchPhysical =
    punchType === "round" ? PUNCH_PHYSICAL.round : PUNCH_PHYSICAL.ovoid;
  const punchMargin = PUNCH_MARGIN * punchDisplayScale;
  const punchW = punchPhysical.w * punchDisplayScale;
  const punchH = punchPhysical.h * punchDisplayScale;

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const update = () => {
      const rect = img.getBoundingClientRect();
      setImgDisplayWidth(rect.width);
      setImgDisplayHeight(rect.height);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(img);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [image.previewUrl]);

  const chipRect = useMemo(
    () =>
      computeChipOverlay(
        chipPosition ?? undefined,
        {
          punchType: punchType ?? undefined,
          punchPosition: punchPosition ?? undefined,
          punchQuantity: punchQuantity ?? undefined,
        },
        0,
        0,
        imgDisplayWidth,
        imgDisplayHeight,
        {
          punchScale: punchDisplayScale,
          chipSize: { w: 29.952, h: 22.176 },
          margin: chipMarginMm * punchDisplayScale,
        },
      ),
    [
      chipMarginMm,
      chipPosition,
      imgDisplayHeight,
      imgDisplayWidth,
      punchDisplayScale,
      punchPosition,
      punchQuantity,
      punchType,
    ],
  );

  const punchOverlayStyles = useCallback((): React.CSSProperties[] => {
    if (!punchType || !punchPosition || punchDisplayScale <= 0) return [];
    const base = {
      width: `${punchW}px`,
      height: `${punchH}px`,
      borderRadius:
        punchType === "round" ? "50%" : `${punchH / 2}px`,
    };
    const margin = `${punchMargin}px`;

    if ((punchQuantity ?? "simple") === "double") {
      if (punchPosition !== "top-center" && punchPosition !== "bottom-center") return [];
      const vertical =
        punchPosition === "top-center" ? { top: margin } : { bottom: margin };
      return [
        { ...base, ...vertical, left: margin },
        { ...base, ...vertical, right: margin },
      ];
    }

    let position: React.CSSProperties;
    switch (punchPosition) {
      case "top-center":
        position = { top: margin, left: "50%", transform: "translateX(-50%)" };
        break;
      case "top-right":
        position = { top: margin, right: margin };
        break;
      case "middle-left":
        position = { top: "50%", left: margin, transform: "translateY(-50%)" };
        break;
      case "middle-center":
        position = { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };
        break;
      case "middle-right":
        position = { top: "50%", right: margin, transform: "translateY(-50%)" };
        break;
      case "bottom-left":
        position = { bottom: margin, left: margin };
        break;
      case "bottom-center":
        position = { bottom: margin, left: "50%", transform: "translateX(-50%)" };
        break;
      case "bottom-right":
        position = { bottom: margin, right: margin };
        break;
      default:
        position = { top: margin, left: margin };
    }
    return [{ ...base, ...position }];
  }, [punchH, punchMargin, punchPosition, punchQuantity, punchType, punchW, punchDisplayScale]);

  const tarjaBottomOverflow = useMemo(() => {
    if (!magneticStripePosition || imgDisplayWidth <= 0 || imgDisplayHeight <= 0) return 0;
    if (magneticStripePosition.startsWith("vertical")) {
      return imgDisplayHeight * 0.075;
    }
    if (magneticStripePosition === "horizontal-top") {
      const tarjaH = imgDisplayWidth * 1.15 * (621 / 1148);
      return Math.max(0, tarjaH + (4 / 25.4) * 96 - imgDisplayHeight);
    }
    return 0;
  }, [imgDisplayHeight, imgDisplayWidth, magneticStripePosition]);

  const readPixel = useCallback(
    (clientX: number, clientY: number): PickedColor | null => {
      const img = imgRef.current;
      if (!img) return null;
      const rect = img.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;

      const x = Math.min(
        image.width - 1,
        Math.max(0, Math.floor(((clientX - rect.left) / rect.width) * image.width)),
      );
      const y = Math.min(
        image.height - 1,
        Math.max(0, Math.floor(((clientY - rect.top) / rect.height) * image.height)),
      );

      const idx = (y * image.width + x) * 4;
      let rgb: Rgb = {
        r: image.imageData.data[idx],
        g: image.imageData.data[idx + 1],
        b: image.imageData.data[idx + 2],
      };

      // Sample the same rendered image the user sees, not a separate decoded buffer.
      const sampleCanvas = sampleCanvasRef.current ?? document.createElement("canvas");
      sampleCanvasRef.current = sampleCanvas;
      sampleCanvas.width = 1;
      sampleCanvas.height = 1;
      const sampleContext = sampleCanvas.getContext("2d");
      if (sampleContext && img.naturalWidth > 0 && img.naturalHeight > 0) {
        sampleContext.clearRect(0, 0, 1, 1);
        sampleContext.drawImage(
          img,
          (x / Math.max(1, image.width - 1)) * (img.naturalWidth - 1),
          (y / Math.max(1, image.height - 1)) * (img.naturalHeight - 1),
          1,
          1,
          0,
          0,
          1,
          1,
        );
        const sampled = sampleContext.getImageData(0, 0, 1, 1).data;
        rgb = { r: sampled[0], g: sampled[1], b: sampled[2] };
      }

      let cmyk: Cmyk | null = null;
      if (image.hasNativeCmyk && image.nativeCmyk) {
        cmyk = {
          c: Math.round((image.nativeCmyk[idx] / 255) * 100),
          m: Math.round((image.nativeCmyk[idx + 1] / 255) * 100),
          y: Math.round((image.nativeCmyk[idx + 2] / 255) * 100),
          k: Math.round((image.nativeCmyk[idx + 3] / 255) * 100),
        };
      }

      if (!cmyk) {
        const savedSample = savedColors.reduce<{
          color: DominantColor;
          distance: number;
        } | null>((closest, color) => {
          if (color.x == null || color.y == null || !color.cmykPrint) return closest;
          const sampleX = color.x * Math.max(1, image.width - 1);
          const sampleY = color.y * Math.max(1, image.height - 1);
          const distance = Math.hypot(sampleX - x, sampleY - y);
          return !closest || distance < closest.distance ? { color, distance } : closest;
        }, null);

        if (savedSample && savedSample.distance <= 4) {
          cmyk = savedSample.color.cmykPrint;
        }
      }

      // Keep legacy one-color records usable until their original images are resaved.
      if (!cmyk && savedColors.length === 1 && savedColors[0].cmykPrint) {
        cmyk = savedColors[0].cmykPrint;
      }

      return {
        rgb,
        hex: rgbToHex(rgb),
        cmyk,
        x: image.width > 1 ? x / (image.width - 1) : 0,
        y: image.height > 1 ? y / (image.height - 1) : 0,
      };
    },
    [image, savedColors],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (!pickerActive) {
        setHover(null);
        return;
      }
      const color = readPixel(e.clientX, e.clientY);
      if (color) {
        const rect = e.currentTarget.getBoundingClientRect();
        setHover({
          screenX: e.clientX,
          screenY: e.clientY,
          color,
          imageX: e.clientX - rect.left,
          imageY: e.clientY - rect.top,
          imageWidth: rect.width,
          imageHeight: rect.height,
        });
      }
    },
    [pickerActive, readPixel],
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (!pickerActive) return;
      const color = readPixel(e.clientX, e.clientY);
      if (color) onPick(color);
    },
    [pickerActive, onPick, readPixel],
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
            />
          </svg>
          <p className="truncate text-sm font-semibold text-slate-700">{image.fileName}</p>
        </div>
        <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {image.format}
        </span>
      </div>

      <div className="relative flex h-[400px] flex-col items-center justify-center gap-3 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#ffffff_0%_50%)] bg-[length:16px_16px] p-4">
        <div className="relative">
          {(magneticStripePosition === "vertical-left" ||
            magneticStripePosition === "vertical-right") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={
                magneticStripePosition === "vertical-left"
                  ? "/tarja_vertical_esquerda.jpg"
                  : "/tarja_vertical_direita.jpg"
              }
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute z-0 max-w-none object-contain"
              style={{
                height: "115%",
                width: "auto",
                top: "50%",
                transform: "translateY(-50%)",
                ...(magneticStripePosition === "vertical-left"
                  ? { left: "4mm" }
                  : { right: "4mm" }),
              }}
            />
          )}
          {magneticStripePosition === "horizontal-top" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/tarja_horizontal_cima.jpg"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute z-0 max-w-none object-contain"
              style={{
                width: "115%",
                height: "auto",
                left: "50%",
                top: "4mm",
                transform: "translateX(-50%)",
              }}
            />
          )}
          {magneticStripePosition === "horizontal-bottom" && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/tarja_horizontal_baixo.jpg"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute z-0 max-w-none object-contain"
              style={{
                width: "115%",
                height: "auto",
                left: "50%",
                bottom: "4mm",
                transform: "translateX(-50%)",
              }}
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
             src={image.previewUrl}
            alt={`Pré-visualização de ${image.fileName}`}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            onClick={handleClick}
            className={`relative z-10 max-h-64 w-auto max-w-full object-contain shadow-sm ${
              isBlankRecipient ? "" : "rounded-lg"
            } ${pickerActive ? "cursor-none" : ""}`}
          />
          {chipRect && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/chip.png"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute z-20"
              style={{
                left: chipRect.x,
                top: chipRect.y,
                width: chipRect.w,
                height: chipRect.h,
              }}
            />
          )}
          {punchOverlayStyles().map((style, index) => (
            <div
              key={index}
              className="pointer-events-none absolute z-20 border border-black bg-white"
              style={style}
            />
          ))}
        </div>

        {chipRect?.displaced && (
          <p
            className="text-center text-[11px] font-bold uppercase tracking-wide text-red-600"
            style={{ marginTop: tarjaBottomOverflow }}
          >
            {CHIP_DISPLACED_LABEL}
          </p>
        )}

        {pickerActive && hover && (
          <div
            className="pointer-events-none fixed z-50"
            style={{ left: hover.screenX, top: hover.screenY }}
          >
            <div className="relative -translate-x-1/2 -translate-y-1/2">
              <div
                className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-4 border-white shadow-xl ring-2 ring-slate-900/50"
                style={{
                  width: "4cm",
                  height: "4cm",
                  backgroundColor: hover.color.hex,
                }}
              >
                {/* Position the sampled pixel under the geometric center of the cross. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.previewUrl}
                  alt=""
                  aria-hidden="true"
                  className="pointer-events-none absolute max-w-none"
                  style={{
                    width: hover.imageWidth * MAGNIFIER_ZOOM,
                    height: hover.imageHeight * MAGNIFIER_ZOOM,
                    left: `calc(50% - ${hover.imageX * MAGNIFIER_ZOOM}px)`,
                    top: `calc(50% - ${hover.imageY * MAGNIFIER_ZOOM}px)`,
                  }}
                />
                <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-slate-900/25 shadow-[0_0_0_1px_rgba(15,23,42,0.8)]" />
                <span className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white shadow-[1px_0_0_rgba(15,23,42,0.75)]" />
                <span className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white shadow-[0_1px_0_rgba(15,23,42,0.75)]" />
              </div>
              <div className="absolute left-1/2 top-[calc(2cm+8px)] flex -translate-x-1/2 items-center gap-1">
                <span
                  className="h-4 w-4 shrink-0 rounded-sm border border-slate-300 shadow-sm"
                  style={{
                    backgroundColor: hover.color.hex,
                  }}
                  aria-label={`Cor adquirida ${hover.color.hex}`}
                />
                <span
                  className="whitespace-nowrap rounded-md border border-slate-300 px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-tight text-slate-800 shadow-sm"
                  style={{ backgroundColor: "rgba(255,255,255,0.95)" }}
                >
                  {cmykLabel(hover.color)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-400">
        <span>
          Dimensões de análise: {image.width} × {image.height} px
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
          Processado localmente
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onTogglePicker("replace")}
            aria-pressed={pickerMode === "replace"}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              pickerMode === "replace"
                ? "bg-blue-600 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <EyedropperIcon className="h-4 w-4" />
            ADQUIRIR CORES
          </button>
          <button
            type="button"
            onClick={() => onTogglePicker("append")}
            aria-pressed={pickerMode === "append"}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              pickerMode === "append"
                ? "bg-blue-600 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <EyedropperIcon className="h-4 w-4" />
            ADICIONAR CORES
          </button>
        </div>
        <p className="text-xs text-slate-500">
          {pickerActive
            ? pickerMode === "append"
              ? "Clique sobre a imagem para adicionar a cor à paleta sem apagar as já adquiridas."
              : "Clique sobre a imagem para escolher a cor. A primeira seleção substitui as cores automáticas."
            : "Escolha cores manualmente na imagem."}
        </p>
      </div>
    </div>
  );
}
