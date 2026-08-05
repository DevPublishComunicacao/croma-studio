"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  CHIP_DISPLACED_LABEL,
  CHIP_PHYSICAL,
  chipDisplacedLabelY,
  computeApprovalGeometry,
  computeApprovalPalette,
  computeChipOverlay,
  computePunchOverlays,
  computeTarjaOverlay,
  approvalPaletteMinHeight,
  type ApprovalPalette,
} from "@/lib/export/approvalLayout";
import { fitImageToFrame } from "@/lib/export/approvalPdf";
import { MAX_COLORS_PER_FACE } from "@/lib/color/analysis";
import type { AnalysisResult, DominantColor, JobData } from "@/lib/types";

const IMAGE_MARGIN_Y = 10;

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 10;
const LABEL_W = 44;
const LABEL_H = 13;
const LOGO_W = 24;
const LOGO_H = (24 * 222) / 320;
const PALETTE_W = 43.2;
const FACE_TOP_OFFSET = 8;
const MAX_FACE_BOX_HEIGHT = FACE_TOP_OFFSET + approvalPaletteMinHeight(MAX_COLORS_PER_FACE);
const TARJA_ENVELOPE_SCALE = 1.15;

function useCmykDisplayImage(src: string): string | null {
  const [processed, setProcessed] = useState<{ src: string; value: string | null }>({
    src: "",
    value: null,
  });

  useEffect(() => {
    if (!src) return;

    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        if (!cancelled) setProcessed({ src, value: src });
        return;
      }

      context.drawImage(image, 0, 0);
      if (!cancelled) setProcessed({ src, value: canvas.toDataURL("image/png") });
    };
    image.onerror = () => {
      if (!cancelled) setProcessed({ src, value: src });
    };
    image.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return processed.src === src ? processed.value : null;
}

function usePreparedCmykResult(result: AnalysisResult): AnalysisResult | null {
  const ready = result.colors.every((color) => color.cmykPrint != null);
  const [prepared, setPrepared] = useState<{
    source: AnalysisResult | null;
    value: AnalysisResult | null;
  }>({
    source: null,
    value: null,
  });

  useEffect(() => {
    if (ready) return;

    let cancelled = false;
    void (async () => {
      try {
        const icc = await import("@/lib/color/icc");
        const converter = await icc.createRgbToCmykConverter(result.options.iccProfileId);
        const cmyks = converter.convert(result.colors.map((color) => color.rgb));
        converter.close();
        if (cancelled) return;
        setPrepared({
          source: result,
          value: {
            ...result,
            colors: result.colors.map((color, index) => ({
              ...color,
              cmykPrint: color.cmykPrint ?? cmyks[index],
            })),
          },
        });
      } catch {
        if (!cancelled) setPrepared({ source: result, value: result });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, result]);

  return ready ? result : prepared.source === result ? prepared.value : null;
}

function centeredImageY({
  result,
  imgX,
  imgW,
  imgH,
  boxTop,
  boxBottom,
}: {
  result: AnalysisResult;
  imgX: number;
  imgW: number;
  imgH: number;
  boxTop: number;
  boxBottom: number;
}): number {
  const centeredY = boxTop + (boxBottom - boxTop - imgH) / 2;
  const fitted = fitImageToFrame(result, imgX, centeredY, imgW, imgH);
  const tarja = computeTarjaOverlay(
    result.magneticStripePosition,
    fitted.x,
    fitted.y,
    fitted.width,
    fitted.height,
  );
  if (!tarja) return centeredY;

  const visualTop = Math.min(fitted.y, tarja.y);
  const visualBottom = Math.max(fitted.y + fitted.height, tarja.y + tarja.h);
  const visualCenter = (visualTop + visualBottom) / 2;
  const boxCenter = (boxTop + boxBottom) / 2;
  return centeredY + boxCenter - visualCenter;
}

const mm = (v: number, scale: number) => `${Math.round(v * scale)}px`;

function cmykLines(color: DominantColor): string[] {
  const c = color.cmykPrint ?? color.cmykApprox;
  return [`C: ${c.c}%`, `M: ${c.m}%`, `Y: ${c.y}%`, `K: ${c.k}%`];
}

function PaletteBox({
  color,
  x,
  y,
  w,
  h,
  scale,
}: {
  color: DominantColor;
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
}) {
  const hasName = Boolean(color.name && color.name.trim());

  return (
    <div
      className="absolute overflow-hidden border border-slate-200 bg-white"
      style={{
        left: mm(x, scale),
        top: mm(y, scale),
        width: mm(w, scale),
        height: mm(h, scale),
        fontFamily: "Courier New, monospace",
      }}
    >
      <div
        className="w-full border-b border-slate-200"
        style={{
          height: mm(3.6, scale),
          backgroundColor: color.hex,
        }}
         />
      <div className="flex h-[calc(100%-3.6mm)] items-center justify-center px-[2px]">
        {hasName ? (
          <p
            className="line-clamp-2 text-center font-bold uppercase leading-[1.15] text-[#0f172a]"
            style={{ fontSize: mm(2.6, scale) }}
          >
            {color.name}
          </p>
        ) : (
          <div className="w-full font-bold leading-[1.15] text-[#0f172a]">
            {cmykLines(color).map((line) => (
              <p
                key={line}
                className="whitespace-nowrap text-left"
                style={{ fontSize: mm(2.4, scale), paddingLeft: mm(1.2, scale) }}
              >
                {line}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const CARD_WIDTH_MM = 85.5;

function PunchOverlay({
  result,
  fitted,
  scale,
}: {
  result: AnalysisResult;
  fitted: { x: number; y: number; width: number; height: number };
  scale: number;
}) {
  const punches = computePunchOverlays(
    result.punchType,
    result.punchPosition,
    result.punchQuantity,
    fitted.x,
    fitted.y,
    fitted.width,
    fitted.height,
    fitted.width / CARD_WIDTH_MM,
  );
  if (punches.length === 0) return null;
  const round = result.punchType === "round";
  return (
    <>
      {punches.map((punch, index) => (
        <div
          key={index}
          className="pointer-events-none absolute"
          style={{
            left: mm(punch.x, scale),
            top: mm(punch.y, scale),
            width: mm(punch.w, scale),
            height: mm(punch.h, scale),
            backgroundColor: "#ffffff",
            border: "1px solid #000000",
            borderRadius: round ? "50%" : mm(punch.h / 2, scale),
            zIndex: 2,
          }}
        />
      ))}
    </>
  );
}

function PaletteColumn({
  palette,
  result,
  scale,
}: {
  palette: ApprovalPalette;
  result: AnalysisResult;
  scale: number;
}) {
  return (
    <>
      <div
        className="absolute"
        style={{
          left: mm(palette.x - 2, scale),
          top: mm(palette.y, scale),
          width: 1,
          height: mm(palette.h, scale),
          backgroundColor: "#F18A45",
        }}
      />
      <div className="absolute" style={{ left: mm(palette.x, scale), top: mm(palette.headerY, scale), width: mm(palette.w, scale) }}>
        <p
          className="font-bold uppercase leading-none text-[#0f172a]"
          style={{ fontSize: mm(2.8, scale), fontFamily: "Helvetica, Arial, sans-serif" }}
        >
          Paleta identificada
        </p>
        <p
          className="mt-[1px] font-bold uppercase leading-[1.15] text-[#DC2626]"
          style={{ fontSize: mm(1.9, scale), fontFamily: "Helvetica, Arial, sans-serif" }}
        >
          {result.colors.length} cor(es) entre{" "}
          {result.sampledPixels.toLocaleString("pt-BR")} pixels amostrados ·{" "}
          {result.mode === "predominantes" ? "por área ocupada" : "por destaque visual"}
        </p>
      </div>
      {palette.boxes.map((box, i) => (
        <PaletteBox
          key={`${box.color.hex}-${i}`}
          color={box.color}
          x={box.x}
          y={box.y}
          w={box.w}
          h={box.h}
          scale={scale}
        />
      ))}
    </>
  );
}

function useResponsiveScale(maxScale = 6): [React.RefObject<HTMLDivElement | null>, number] {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(2.2);

  useEffect(() => {
    const update = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw <= 0 || vh <= 0) return;
      const s = Math.max(
        0.6,
        Math.min((vw - 48) / PAGE_W, (vh - 180) / PAGE_H, maxScale),
      );
      setScale(s);
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [maxScale]);

  return [containerRef, scale];
}

export function ApprovalPreviewPage({
  result,
  previewDataUrl,
  verso,
  job,
  scaleOverride,
  captureRef,
}: {
  result: AnalysisResult;
  previewDataUrl: string;
  verso?: {
    result: AnalysisResult;
    previewDataUrl: string;
  };
  job?: JobData | null;
  scaleOverride?: number | null;
  captureRef?: RefObject<HTMLDivElement | null>;
}) {
  const displayResult = usePreparedCmykResult(result);
  const preparedVersoResult = usePreparedCmykResult(verso?.result ?? result);
  const displayVersoResult = verso ? preparedVersoResult : null;
  const displayFrontUrl = useCmykDisplayImage(previewDataUrl);
  const displayVersoUrl = useCmykDisplayImage(verso?.previewDataUrl ?? "");
  const geo = useMemo(
    () => {
      const hasVersoImage = Boolean(verso?.previewDataUrl?.trim());
      const imageTopOffset = hasVersoImage ? FACE_TOP_OFFSET + 8 : FACE_TOP_OFFSET;
      const availableImageHeight =
        MAX_FACE_BOX_HEIGHT - imageTopOffset - IMAGE_MARGIN_Y;
      const hasTarja = Boolean(
        result.magneticStripePosition || verso?.result.magneticStripePosition,
      );

      return computeApprovalGeometry({
        result,
        pageW: PAGE_W,
        pageH: PAGE_H,
        margin: MARGIN,
        labelW: LABEL_W,
        labelH: LABEL_H,
        labelGap: 5,
        hasVerso: hasVersoImage,
        imageMarginY: IMAGE_MARGIN_Y,
        paletteW: PALETTE_W,
        maxImageHeight: availableImageHeight / (hasTarja ? TARJA_ENVELOPE_SCALE : 1),
      });
    },
    [result, verso],
  );
  const [containerRef, responsiveScale] = useResponsiveScale();
  const scale = scaleOverride ?? responsiveScale;
  const hasFrontImage = Boolean(previewDataUrl?.trim());
  const hasVersoImage = Boolean(verso?.previewDataUrl?.trim());
  const previewLoading =
    (hasFrontImage && !displayFrontUrl) ||
    (hasVersoImage && !displayVersoUrl) ||
    !displayResult ||
    (hasVersoImage && !displayVersoResult);
  const imageBottom = geo.imgY + geo.imgH;
  const frontBoxTop = MARGIN + 37;
  const frontPaletteY = frontBoxTop + FACE_TOP_OFFSET;
  const frontMaxBoxBottom = frontBoxTop + MAX_FACE_BOX_HEIGHT;
  const frontBoxBottom = hasFrontImage
    ? Math.min(
        frontMaxBoxBottom,
        Math.max(
          imageBottom + IMAGE_MARGIN_Y,
          frontPaletteY + approvalPaletteMinHeight(displayResult?.colors.length ?? result.colors.length),
        ),
      )
    : frontBoxTop;
  const versoTopLineY = frontBoxBottom + 2;
  const versoBottomLineY = versoTopLineY + 8;
  const versoFrameY = versoBottomLineY + IMAGE_MARGIN_Y;
  const versoW = hasVersoImage ? geo.imgW : 0;
  const versoH = hasVersoImage ? geo.imgH : 0;
  const versoPaletteMinBottom =
    versoBottomLineY +
    approvalPaletteMinHeight(displayVersoResult?.colors.length ?? verso?.result.colors.length ?? 0);
  const versoMaxBoxBottom = versoTopLineY + MAX_FACE_BOX_HEIGHT;
  const versoBoxBottom = hasVersoImage
    ? Math.min(
        versoMaxBoxBottom,
        Math.max(versoFrameY + versoH + IMAGE_MARGIN_Y, versoPaletteMinBottom),
      )
    : versoFrameY;
  const frontImageY = centeredImageY({
    result,
    imgX: geo.imgX,
    imgW: geo.imgW,
    imgH: geo.imgH,
    boxTop: frontPaletteY,
    boxBottom: frontBoxBottom,
  });
  const versoY = hasVersoImage
      ? centeredImageY({
        result: verso!.result,
        imgX: geo.imgX,
        imgW: versoW,
        imgH: versoH,
        boxTop: versoBottomLineY,
        boxBottom: versoBoxBottom,
      })
    : versoFrameY;
  const fittedFront = fitImageToFrame(result, geo.imgX, frontImageY, geo.imgW, geo.imgH);
  const fittedVerso = verso
    ? fitImageToFrame(verso.result, geo.imgX, versoY, versoW, versoH)
    : null;

  const frontPalette = computeApprovalPalette({
      colors: displayResult?.colors ?? result.colors,
      x: geo.paletteX,
      y: frontPaletteY,
    w: PALETTE_W,
    h: frontBoxBottom - (MARGIN + 37 + 8),
  });
  const versoPalette =
    verso && versoH > 0
      ? computeApprovalPalette({
          colors: displayVersoResult?.colors ?? verso.result.colors,
          x: geo.paletteX,
          y: versoBottomLineY,
          w: PALETTE_W,
          h: versoBoxBottom - versoBottomLineY,
        })
      : null;

  const valueOrPlaceholder = (value?: string) =>
    value?.trim().toUpperCase() || "NÃO";
  const approvalRows = [
    [
      { label: "CLIENTE", value: valueOrPlaceholder(job?.cliente), span: 2 },
      { label: "TIPO DE ARTE", value: "MOCKUP", span: 1 },
    ],
    [
      { label: "PRODUTO", value: valueOrPlaceholder(job?.produto), span: 2 },
      { label: "MATERIAL", value: valueOrPlaceholder(job?.material), span: 1 },
    ],
    [
      { label: "TAMANHO", value: valueOrPlaceholder(job?.tamanho), span: 1 },
      { label: "ESPESSURA", value: valueOrPlaceholder(job?.espessura), span: 1 },
      { label: "CORES", value: valueOrPlaceholder(job?.cores), span: 1 },
    ],
  ];
  const technologyRows = [
    [
      {
        label: "TARJA MAGNÉTICA",
        value: job ? (job.tarjaMagnetica ? "SIM" : "NÃO") : "NÃO",
      },
      {
        label: "CHIP RFID",
        value: job ? (job.chipRfid ? "SIM" : "NÃO") : "NÃO",
      },
    ],
    [
      { label: "TIPO DE TARJA", value: valueOrPlaceholder(job?.tipoTarja) },
      { label: "TIPO DO CHIP", value: valueOrPlaceholder(job?.tipoChip) },
    ],
    [
      { label: "INFRARED", value: job ? (job.infrared ? "SIM" : "NÃO") : "NÃO" },
      { label: "COR", value: valueOrPlaceholder(job?.infraredCor) },
    ],
  ];

  return (
    <div
      ref={containerRef}
      className="flex w-full items-start justify-center"
    >
      <div
        ref={captureRef}
        className="relative shrink-0 overflow-hidden bg-white shadow-2xl"
        style={{
          width: mm(PAGE_W, scale),
          height: mm(PAGE_H, scale),
          outline: "1px solid #cbd5e1",
        }}
      >
        <img
          src="/logo_novo_p.png"
          alt="Logotipo"
          className="absolute"
          style={{
            left: mm(MARGIN, scale),
            top: mm(MARGIN, scale),
            width: mm(LOGO_W, scale),
            height: mm(LOGO_H, scale),
          }}
        />

        <div
          className="absolute overflow-hidden border"
          style={{
            left: mm(MARGIN + LOGO_W + 2, scale),
            top: mm(MARGIN + (LOGO_H - 16.5) / 2, scale),
            width: mm(PAGE_W - MARGIN - (MARGIN + LOGO_W + 2), scale),
            height: mm(16.5, scale),
            borderColor: "#F18A45",
            borderWidth: 1,
            borderRadius: mm(1.5, scale),
          }}
          >
            <div className="absolute inset-0 grid grid-rows-3">
              {approvalRows.map((row, rowIndex) => (
                <div
                  className="grid grid-cols-3"
                  style={{
                    transform: `translateY(${mm((1 - rowIndex) * 1.5, scale)})`,
                  }}
                  key={rowIndex}
                >
                  {row.map((field) => (
                    <div
                      className="flex items-center justify-start text-left leading-none"
                      style={{
                        gridColumn: `span ${field.span}`,
                        paddingLeft: mm(
                          ["CLIENTE", "PRODUTO", "TAMANHO"].includes(field.label) ? 3 : 2.5,
                          scale,
                        ),
                        paddingRight: mm(1.5, scale),
                         fontSize: mm(2.2, scale),
                        fontFamily: "Helvetica, Arial, sans-serif",
                      }}
                      key={field.label}
                    >
                      <>
                        <strong>{field.label}:</strong>
                        <span style={{ marginLeft: mm(0.5, scale) }}>{field.value}</span>
                      </>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

        <div
          className="absolute whitespace-nowrap bg-white px-2 font-bold leading-none text-[#0f172a]"
          style={{
            left: mm(
              MARGIN +
                LOGO_W +
                2 +
                (PAGE_W - MARGIN - (MARGIN + LOGO_W + 2)) / 2,
              scale,
            ),
            top: mm(MARGIN + (LOGO_H - 16.5) / 2 - 1.5, scale),
            transform: "translateX(-50%)",
             fontSize: mm(2.6, scale),
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          LAYOUT VIRTUAL PARA APROVAÇÃO E FICHA TÉCNICA DE PRODUÇÃO
        </div>

        <div
          className="absolute overflow-hidden"
          style={{
            left: mm(MARGIN, scale),
            top: mm(MARGIN + LOGO_H + 2, scale),
            width: mm((PAGE_W - MARGIN * 2 - 2) / 2, scale),
            height: mm(16.5, scale),
            border: "1px solid #F18A45",
            borderRadius: mm(1.5, scale),
          }}
        >
          <div className="absolute inset-0 grid grid-rows-3">
            {technologyRows.map((row, rowIndex) => (
              <div
                className="grid grid-cols-2"
                style={{ transform: `translateY(${mm((1 - rowIndex) * 1.5, scale)})` }}
                key={rowIndex}
              >
                {row.map((field) => (
                  <div
                    className="flex items-center justify-start text-left leading-none"
                    style={{
                      paddingLeft: mm(3, scale),
                      paddingRight: mm(1.5, scale),
                       fontSize: mm(2.2, scale),
                      fontFamily: "Helvetica, Arial, sans-serif",
                    }}
                    key={field.label}
                  >
                    <>
                      <strong>{field.label}:</strong>
                      <span style={{ marginLeft: mm(0.5, scale) }}>{field.value}</span>
                    </>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div
          className="absolute"
          style={{
            left: mm(MARGIN + ((PAGE_W - MARGIN * 2 - 2) / 2 + 2), scale),
            top: mm(MARGIN + LOGO_H + 2, scale),
            width: mm((PAGE_W - MARGIN * 2 - 2) / 2, scale),
            height: mm(16.5, scale),
            border: "1px solid #F18A45",
            borderRadius: mm(1.5, scale),
           }}
         >
           <div
             className="absolute bg-white px-2 font-bold leading-none text-[#0f172a]"
             style={{
               left: "50%",
               top: 0,
               transform: "translate(-50%, -50%)",
               fontSize: mm(2.6, scale),
               fontFamily: "Helvetica, Arial, sans-serif",
             }}
           >
             ACABAMENTO
           </div>
           <div
             className="absolute left-0 right-0 text-center leading-none text-[#0f172a]"
             style={{
               top: "50%",
               transform: "translateY(-50%)",
               padding: `0 ${mm(3, scale)}`,
               fontSize: mm(2.6, scale),
               fontFamily: "Helvetica, Arial, sans-serif",
             }}
           >
              {job?.acabamento?.trim() || ""}
           </div>
         </div>
        {hasVersoImage && <div
          className="absolute text-center font-bold leading-none text-[#DC2626]"
          style={{
            left: mm(MARGIN, scale),
            top: mm(versoTopLineY + 2.5, scale),
            width: mm(PAGE_W - MARGIN * 2, scale),
            fontSize: mm(3.5, scale),
            lineHeight: mm(3.5, scale),
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          VERSO
        </div>}
        {hasVersoImage && <div
          className="absolute"
          style={{
            left: mm(MARGIN, scale),
            top: mm(versoBottomLineY, scale),
            width: mm(PAGE_W - MARGIN * 2, scale),
            height: 1,
            backgroundColor: "#F18A45",
          }}
        />}

        {hasFrontImage && <div
          className="absolute text-center font-bold leading-none text-[#DC2626]"
          style={{
            left: mm(MARGIN, scale),
            top: mm(MARGIN + 37 + 2.5, scale),
            width: mm(PAGE_W - MARGIN * 2, scale),
            fontSize: mm(3.5, scale),
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          FRENTE
        </div>}
        {hasFrontImage && <div
          className="absolute"
          style={{
            left: mm(MARGIN, scale),
            top: mm(MARGIN + 37 + 8, scale),
            width: mm(PAGE_W - MARGIN * 2, scale),
            height: 1,
            backgroundColor: "#F18A45",
          }}
        />}

        <div
          className="absolute whitespace-nowrap bg-white px-2 font-bold leading-none text-[#0f172a]"
          style={{
            left: mm(MARGIN + ((PAGE_W - MARGIN * 2 - 2) / 2) / 2, scale),
            top: mm(MARGIN + LOGO_H + 2 - 1.5, scale),
            transform: "translateX(-50%)",
             fontSize: mm(2.6, scale),
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          TECNOLOGIA
        </div>

        <div
          className="absolute whitespace-nowrap bg-white px-2 font-bold leading-none text-[#0f172a]"
          style={{
            left: mm(MARGIN + (PAGE_W - MARGIN * 2 - 2) / 2 + 2 + (PAGE_W - MARGIN * 2 - 2) / 4, scale),
            top: mm(MARGIN + LOGO_H + 2 - 1.5, scale),
            transform: "translateX(-50%)",
             fontSize: mm(2.6, scale),
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          ACABAMENTO
        </div>

        {hasFrontImage && <div
          className="absolute"
          style={{
            left: mm(MARGIN, scale),
            top: mm(MARGIN + 37, scale),
            width: mm(PAGE_W - MARGIN * 2, scale),
            height: mm(frontBoxBottom - (MARGIN + 37), scale),
            border: "1px solid #F18A45",
            borderRadius: mm(1.5, scale),
          }}
        />}

        {hasVersoImage && versoH > 0 && (
          <div
            className="absolute"
            style={{
              left: mm(MARGIN, scale),
              top: mm(versoTopLineY, scale),
              width: mm(PAGE_W - MARGIN * 2, scale),
              height: mm(versoBoxBottom - versoTopLineY, scale),
              border: "1px solid #F18A45",
              borderRadius: mm(1.5, scale),
            }}
          />
        )}

        {hasFrontImage && <div
          className="absolute"
          style={{
            left: mm(geo.imgX - 3, scale),
            top: mm(frontImageY - 3, scale),
            width: mm(geo.imgW + 6, scale),
            height: mm(geo.imgH + 6, scale),
            backgroundColor: "transparent",
            border: "none",
          }}
        />}
        {hasFrontImage && <img
          src={displayFrontUrl ?? previewDataUrl}
          alt="Arte"
          className="absolute"
          style={{
            left: mm(geo.imgX, scale),
            top: mm(frontImageY, scale),
           width: mm(geo.imgW, scale),
            height: mm(geo.imgH, scale),
            objectFit: "contain",
            opacity: displayFrontUrl ? 1 : 0,
            zIndex: 1,
          }}
        />}
        {hasFrontImage && (() => {
          const punchScale = fittedFront.width / CARD_WIDTH_MM;
          const chipMarginMm = result.imageHeight > result.imageWidth ? 9 : 13.5;
          const chip = computeChipOverlay(
            result.chipPosition,
            result,
            fittedFront.x,
            fittedFront.y,
            fittedFront.width,
            fittedFront.height,
            {
              punchScale,
              chipSize: CHIP_PHYSICAL,
              margin: chipMarginMm * punchScale,
              gap: 1.5,
            },
          );
          if (!chip) return null;
          return (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/chip.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{
                  left: mm(chip.x, scale),
                  top: mm(chip.y, scale),
                  width: mm(chip.w, scale),
                  height: mm(chip.h, scale),
                  zIndex: 2,
                }}
              />
              {chip.displaced && (
                <p
                  className="absolute text-center font-bold uppercase leading-none text-[#DC2626]"
                  style={{
                    left: mm(MARGIN, scale),
                    top: mm(chipDisplacedLabelY(result, fittedFront), scale),
                    width: mm(geo.paletteX - MARGIN, scale),
                    fontSize: mm(2.4, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  {CHIP_DISPLACED_LABEL}
                </p>
              )}
            </>
          );
        })()}
        {hasFrontImage && (
          <PunchOverlay result={result} fitted={fittedFront} scale={scale} />
        )}
        {hasFrontImage && (() => {
          const tarja = computeTarjaOverlay(
            result.magneticStripePosition,
            fittedFront.x,
            fittedFront.y,
            fittedFront.width,
            fittedFront.height,
          );
          if (!tarja) return null;
          return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tarja.src}
              alt="Tarja magnética"
              className="absolute object-contain"
              style={{
                left: mm(tarja.x, scale),
                top: mm(tarja.y, scale),
                width: mm(tarja.w, scale),
                height: mm(tarja.h, scale),
                zIndex: 0,
              }}
            />
          );
        })()}

        {hasFrontImage && (
          <PaletteColumn
            palette={frontPalette}
            result={displayResult ?? result}
            scale={scale}
          />
        )}

        {verso && hasVersoImage && versoH > 0 && versoW > 0 && (
          <>
            <div
              className="absolute"
              style={{
                left: mm(geo.imgX - 3, scale),
                top: mm(versoY - 3, scale),
                width: mm(versoW + 6, scale),
                height: mm(versoH + 6, scale),
                backgroundColor: "transparent",
                border: "none",
              }}
            />
            <img
              src={displayVersoUrl ?? verso.previewDataUrl}
              alt="Arte do verso"
              className="absolute"
              style={{
                left: mm(geo.imgX, scale),
                top: mm(versoY, scale),
                width: mm(versoW, scale),
                height: mm(versoH, scale),
                objectFit: "contain",
                opacity: displayVersoUrl ? 1 : 0,
                zIndex: 1,
              }}
            />
            {(() => {
              const punchScale = fittedVerso!.width / CARD_WIDTH_MM;
              const chipMarginMm =
                verso.result.imageHeight > verso.result.imageWidth ? 9 : 13.5;
              const chip = computeChipOverlay(
                verso.result.chipPosition,
                verso.result,
                fittedVerso!.x,
                fittedVerso!.y,
                fittedVerso!.width,
                fittedVerso!.height,
                {
                  punchScale,
                  chipSize: CHIP_PHYSICAL,
                  margin: chipMarginMm * punchScale,
                  gap: 1.5,
                },
              );
              if (!chip) return null;
              return (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/chip.png"
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute"
                    style={{
                      left: mm(chip.x, scale),
                      top: mm(chip.y, scale),
                      width: mm(chip.w, scale),
                      height: mm(chip.h, scale),
                      zIndex: 2,
                    }}
                  />
                  {chip.displaced && (
                    <p
                      className="absolute text-center font-bold uppercase leading-none text-[#DC2626]"
                      style={{
                        left: mm(MARGIN, scale),
                        top: mm(chipDisplacedLabelY(verso.result, fittedVerso!), scale),
                        width: mm(geo.paletteX - MARGIN, scale),
                        fontSize: mm(2.4, scale),
                        fontFamily: "Helvetica, Arial, sans-serif",
                      }}
                    >
                      {CHIP_DISPLACED_LABEL}
                    </p>
                  )}
                </>
              );
            })()}
            {fittedVerso && (
              <PunchOverlay result={verso.result} fitted={fittedVerso} scale={scale} />
            )}
            {(() => {
              const tarja = computeTarjaOverlay(
                verso.result.magneticStripePosition,
                fittedVerso!.x,
                fittedVerso!.y,
                fittedVerso!.width,
                fittedVerso!.height,
              );
              if (!tarja) return null;
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tarja.src}
                  alt="Tarja magnética do verso"
                  className="absolute object-contain"
                  style={{
                    left: mm(tarja.x, scale),
                    top: mm(tarja.y, scale),
                    width: mm(tarja.w, scale),
                    height: mm(tarja.h, scale),
                    zIndex: 0,
                  }}
                />
              );
            })()}
            {versoPalette && (
              <PaletteColumn
                palette={versoPalette}
                result={displayVersoResult ?? verso.result}
                scale={scale}
              />
            )}
          </>
        )}

<p
          className="absolute font-bold text-[#DC2626]"
          style={{
            left: mm(MARGIN, scale),
            top: mm(PAGE_H - MARGIN - 35, scale),
            fontSize: mm(2.6, scale),
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          ATENÇÃO:
        </p>
        <p
          className="absolute text-[#000000]"
          style={{
            left: mm(MARGIN, scale),
            right: mm(MARGIN, scale),
            top: mm(PAGE_H - MARGIN - 30, scale),
            fontSize: mm(2.6, scale),
            lineHeight: mm(3.3, scale),
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          Por favor, verifique cuidadosamente a arte, as cores e a ortografia antes de aprovar o layout. Após a
          aprovação final, a responsabilidade pelo layout passa a ser exclusivamente do cliente. Informamos que todos
          os elementos do layout, incluindo logotipos e espaçamentos, podem ser ajustados em tamanho para se adequarem
          ao nosso gabarito. Ressaltamos ainda que as cores apresentadas podem sofrer variações de até 10% em
          comparação à última produção.
        </p>
        {(() => {
          const cols = 6;
          const rows = 1;
          const boxGap = 1;
          const boxW = (PAGE_W - MARGIN * 2 - boxGap * (cols - 1)) / cols;
          const boxH = 11;
          const boxesY = PAGE_H - MARGIN - 17;
          const cells: { c: number; r: number }[] = [];
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) cells.push({ c, r });
          }
          return cells.map(({ c, r }) => (
            <div
              key={`box-${r}-${c}`}
              className="absolute border border-[#F18A45]"
              style={{
                left: mm(MARGIN + c * (boxW + boxGap), scale),
                top: mm(boxesY + r * (boxH + boxGap), scale),
                width: mm(boxW, scale),
                height: mm(boxH, scale),
                borderRadius: mm(1.5, scale),
                overflow: "hidden",
              }}
            >
              <div
                className="absolute left-1/2 top-0 h-full"
                style={{ width: 1, backgroundColor: "#F18A45" }}
              />
              {c === 0 && (
                <p
                  className="absolute left-0 text-center font-bold uppercase text-[#000000]"
                  style={{
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.4, scale),
                    lineHeight: mm(1.4, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  PRÉ IMPRESSÃO
                </p>
              )}
              {c === 0 && (
                <p
                  className="absolute text-center font-bold uppercase text-[#000000]"
                  style={{
                    left: mm(boxW / 2, scale),
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.9, scale),
                    lineHeight: mm(1.9, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  GESTOR
                </p>
              )}
              {c === 1 && (
                <p
                  className="absolute left-0 text-center font-bold uppercase text-[#000000]"
                  style={{
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.5, scale),
                    lineHeight: mm(1.5, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  OFFSET SILK
                </p>
              )}
              {c === 1 && (
                <p
                  className="absolute text-center font-bold uppercase text-[#000000]"
                  style={{
                    left: mm(boxW / 2, scale),
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.9, scale),
                    lineHeight: mm(1.9, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  GESTOR
                </p>
              )}
              {c === 2 && (
                <p
                  className="absolute left-0 text-center font-bold uppercase text-[#000000]"
                  style={{
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.4, scale),
                    lineHeight: mm(1.4, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  PONTILHAÇÃO
                </p>
              )}
              {c === 2 && (
                <p
                  className="absolute text-center font-bold uppercase text-[#000000]"
                  style={{
                    left: mm(boxW / 2, scale),
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.9, scale),
                    lineHeight: mm(1.9, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  GESTOR
                </p>
              )}
              {c === 3 && (
                <p
                  className="absolute left-0 text-center font-bold uppercase text-[#000000]"
                  style={{
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.4, scale),
                    lineHeight: mm(1.4, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  LAMINAÇÃO
                </p>
              )}
              {c === 3 && (
                <p
                  className="absolute text-center font-bold uppercase text-[#000000]"
                  style={{
                    left: mm(boxW / 2, scale),
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.9, scale),
                    lineHeight: mm(1.9, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  GESTOR
                </p>
              )}
              {c === 4 && (
                <p
                  className="absolute left-0 text-center font-bold uppercase text-[#000000]"
                  style={{
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.5, scale),
                    lineHeight: mm(1.5, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  SELEÇÃO
                </p>
              )}
              {c === 4 && (
                <p
                  className="absolute text-center font-bold uppercase text-[#000000]"
                  style={{
                    left: mm(boxW / 2, scale),
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.9, scale),
                    lineHeight: mm(1.9, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  GESTOR
                </p>
              )}
              {c === 5 && (
                <p
                  className="absolute left-0 text-center font-bold uppercase text-[#000000]"
                  style={{
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.4, scale),
                    lineHeight: mm(1.4, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  FATURAMENTO
                </p>
              )}
              {c === 5 && (
                <p
                  className="absolute text-center font-bold uppercase text-[#000000]"
                  style={{
                    left: mm(boxW / 2, scale),
                    width: mm(boxW / 2, scale),
                    top: mm(1, scale),
                    fontSize: mm(1.9, scale),
                    lineHeight: mm(1.9, scale),
                    fontFamily: "Helvetica, Arial, sans-serif",
                  }}
                >
                  GESTOR
                </p>
              )}
            </div>
          ));
        })()}
        <p
          className="absolute italic text-slate-400"
          style={{
            left: mm(MARGIN, scale),
            right: mm(MARGIN, scale),
            top: mm(PAGE_H - MARGIN - 3, scale),
            fontSize: mm(2.1, scale),
            fontFamily: "Helvetica, Arial, sans-serif",
          }}
        >
          Aviso: os valores CMYK são estimativas para orientação. Confira a prova final antes da impressão.
        </p>
        {previewLoading && (
          <div
            className="absolute inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-white/90 backdrop-blur-[2px]"
            role="status"
            aria-live="polite"
          >
            <span className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-orange-500" />
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
              Preparando cores CMYK...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
