"use client";

import { useCallback, useRef, useState } from "react";

import { EyedropperIcon } from "@/components/EyedropperIcon";
import { rgbToCmykApprox } from "@/lib/color/cmykApprox";
import { rgbToHex } from "@/lib/color/conversions";
import type { Cmyk, LoadedImage, PickerMode, Rgb } from "@/lib/types";

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
  pickerMode: PickerMode | null;
  onTogglePicker: (mode: PickerMode) => void;
  onPick: (color: PickedColor) => void;
}

interface HoverState {
  screenX: number;
  screenY: number;
  color: PickedColor;
}

function cmykLabel(color: PickedColor): string {
  const cmyk = color.cmyk ?? rgbToCmykApprox(color.rgb);
  return `C:${cmyk.c} M:${cmyk.m} Y:${cmyk.y} K:${cmyk.k}`;
}

export function ImagePreview({
  image,
  magneticStripePosition,
  chipPosition,
  pickerMode,
  onTogglePicker,
  onPick,
}: ImagePreviewProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [hover, setHover] = useState<HoverState | null>(null);
  const pickerActive = pickerMode !== null;
  const isBlankRecipient = image.fileName.endsWith("-recipiente.png");
  const chipMargin = image.height > image.width ? "4mm" : "6mm";

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
      const rgb: Rgb = {
        r: image.imageData.data[idx],
        g: image.imageData.data[idx + 1],
        b: image.imageData.data[idx + 2],
      };

      let cmyk: Cmyk | null = null;
      if (image.hasNativeCmyk && image.nativeCmyk) {
        cmyk = {
          c: Math.round((image.nativeCmyk[idx] / 255) * 100),
          m: Math.round((image.nativeCmyk[idx + 1] / 255) * 100),
          y: Math.round((image.nativeCmyk[idx + 2] / 255) * 100),
          k: Math.round((image.nativeCmyk[idx + 3] / 255) * 100),
        };
      }

      return {
        rgb,
        hex: rgbToHex(rgb),
        cmyk,
        x: image.width > 1 ? x / (image.width - 1) : 0,
        y: image.height > 1 ? y / (image.height - 1) : 0,
      };
    },
    [image],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLImageElement>) => {
      if (!pickerActive) {
        setHover(null);
        return;
      }
      const color = readPixel(e.clientX, e.clientY);
      if (color) {
        setHover({ screenX: e.clientX, screenY: e.clientY, color });
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
          {chipPosition && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/chip.png"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute z-20"
              style={{
                width: "29.952px",
                height: "22.176px",
                ...(chipPosition === "top-left"
                  ? { top: chipMargin, left: chipMargin }
                  : chipPosition === "top-right"
                    ? { top: chipMargin, right: chipMargin }
                    : chipPosition === "bottom-left"
                      ? { bottom: chipMargin, left: chipMargin }
                      : { bottom: chipMargin, right: chipMargin }),
              }}
            />
          )}
        </div>

        {pickerActive && hover && (
          <div
            className="pointer-events-none fixed z-50"
            style={{ left: hover.screenX, top: hover.screenY }}
          >
            <div className="relative -translate-x-1/2 -translate-y-1/2">
              <div
                className="absolute left-0 top-0 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow-lg ring-2 ring-slate-900/40"
                style={{ backgroundColor: hover.color.hex }}
              >
                <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900/70" />
                <span className="absolute left-0 top-1/2 h-1.5 w-3 -translate-y-1/2 border-r-2 border-slate-900/70" />
                <span className="absolute right-0 top-1/2 h-1.5 w-3 -translate-y-1/2 border-l-2 border-slate-900/70" />
                <span className="absolute left-1/2 top-0 h-3 w-1.5 -translate-x-1/2 border-b-2 border-slate-900/70" />
                <span className="absolute bottom-0 left-1/2 h-3 w-1.5 -translate-x-1/2 border-t-2 border-slate-900/70" />
              </div>
              <div className="absolute left-1/2 top-7 flex -translate-x-1/2 flex-col items-center gap-1">
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
