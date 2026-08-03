"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  computeApprovalGeometry,
  computeApprovalPalette,
  computeTarjaOverlay,
  type ApprovalPalette,
} from "@/lib/export/approvalLayout";
import { fitImageToFrame } from "@/lib/export/approvalPdf";
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
  const { r, g, b } = color.rgb;
  const rgb = `rgb(${r}, ${g}, ${b})`;

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
        style={{ height: mm(3.6, scale), backgroundColor: rgb }}
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
  const geo = useMemo(
    () =>
      computeApprovalGeometry({
        result,
        pageW: PAGE_W,
        pageH: PAGE_H,
        margin: MARGIN,
        labelW: LABEL_W,
        labelH: LABEL_H,
        labelGap: 5,
        hasVerso: Boolean(verso?.previewDataUrl?.trim()),
        imageMarginY: IMAGE_MARGIN_Y,
        paletteW: PALETTE_W,
      }),
    [result, verso],
  );
  const [containerRef, responsiveScale] = useResponsiveScale();
  const scale = scaleOverride ?? responsiveScale;
  const hasFrontImage = Boolean(previewDataUrl?.trim());
  const hasVersoImage = Boolean(verso?.previewDataUrl?.trim());
  const imageBottom = geo.imgY + geo.imgH;
  const frontBoxBottom = hasFrontImage
    ? imageBottom + IMAGE_MARGIN_Y
    : MARGIN + 37;
  const versoTopLineY = frontBoxBottom + 2;
  const versoBottomLineY = versoTopLineY + 8;
  const versoY = versoBottomLineY + IMAGE_MARGIN_Y;
  const versoW = hasVersoImage ? geo.imgW : 0;
  const versoH = hasVersoImage ? geo.imgH : 0;
  const versoBoxBottom =
    versoY + versoH + IMAGE_MARGIN_Y;
  const fittedFront = fitImageToFrame(result, geo.imgX, geo.imgY, geo.imgW, geo.imgH);
  const fittedVerso = verso
    ? fitImageToFrame(verso.result, geo.imgX, versoY, versoW, versoH)
    : null;

  const frontPalette = computeApprovalPalette({
    colors: result.colors,
    x: geo.paletteX,
    y: MARGIN + 37 + 8,
    w: PALETTE_W,
    h: frontBoxBottom - (MARGIN + 37 + 8),
  });
  const versoPalette =
    verso && versoH > 0
      ? computeApprovalPalette({
          colors: verso.result.colors,
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
            top: mm(geo.imgY - 3, scale),
            width: mm(geo.imgW + 6, scale),
            height: mm(geo.imgH + 6, scale),
            backgroundColor: "transparent",
            border: "none",
          }}
        />}
        {hasFrontImage && <img
          src={previewDataUrl}
          alt="Arte"
          className="absolute"
          style={{
            left: mm(geo.imgX, scale),
            top: mm(geo.imgY, scale),
            width: mm(geo.imgW, scale),
            height: mm(geo.imgH, scale),
            objectFit: "contain",
            zIndex: 1,
          }}
        />}
        {hasFrontImage && result.chipPosition && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/chip.png"
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute"
            style={{
              width: mm(7.92, scale),
              height: mm(5.87, scale),
              ...(result.chipPosition === "top-left"
                ? { left: mm(fittedFront.x + 4, scale), top: mm(fittedFront.y + 4, scale) }
                : result.chipPosition === "top-right"
                  ? {
                      left: mm(fittedFront.x + fittedFront.width - 4 - 7.92, scale),
                      top: mm(fittedFront.y + 4, scale),
                    }
                  : result.chipPosition === "bottom-left"
                    ? {
                        left: mm(fittedFront.x + 4, scale),
                        top: mm(fittedFront.y + fittedFront.height - 4 - 5.87, scale),
                      }
                    : {
                        left: mm(fittedFront.x + fittedFront.width - 4 - 7.92, scale),
                        top: mm(fittedFront.y + fittedFront.height - 4 - 5.87, scale),
                      }),
              zIndex: 2,
            }}
          />
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

        {hasFrontImage && <PaletteColumn palette={frontPalette} result={result} scale={scale} />}

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
              src={verso.previewDataUrl}
              alt="Arte do verso"
              className="absolute"
              style={{
                left: mm(geo.imgX, scale),
                top: mm(versoY, scale),
                width: mm(versoW, scale),
                height: mm(versoH, scale),
                objectFit: "contain",
                zIndex: 1,
              }}
            />
            {verso.result.chipPosition && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/chip.png"
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute"
                style={{
                  width: mm(7.92, scale),
                  height: mm(5.87, scale),
                  ...(verso.result.chipPosition === "top-left"
                    ? { left: mm(fittedVerso!.x + 4, scale), top: mm(fittedVerso!.y + 4, scale) }
                    : verso.result.chipPosition === "top-right"
                      ? {
                          left: mm(fittedVerso!.x + fittedVerso!.width - 4 - 7.92, scale),
                          top: mm(fittedVerso!.y + 4, scale),
                        }
                      : verso.result.chipPosition === "bottom-left"
                        ? {
                            left: mm(fittedVerso!.x + 4, scale),
                            top: mm(fittedVerso!.y + fittedVerso!.height - 4 - 5.87, scale),
                          }
                        : {
                            left: mm(fittedVerso!.x + fittedVerso!.width - 4 - 7.92, scale),
                            top: mm(fittedVerso!.y + fittedVerso!.height - 4 - 5.87, scale),
                          }),
                  zIndex: 2,
                }}
              />
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
              <PaletteColumn palette={versoPalette} result={verso.result} scale={scale} />
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
      </div>
    </div>
  );
}
