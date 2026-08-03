import { CMYK_DISCLAIMER } from "@/lib/color/analysis";
import { downloadBlob } from "@/lib/export/download";
import {
  computeApprovalGeometry,
  computeApprovalPalette,
  computeTarjaOverlay,
  type ApprovalPalette,
} from "@/lib/export/approvalLayout";
import type { AnalysisResult, DominantColor, JobData } from "@/lib/types";
import type jsPDF from "jspdf";

const NAVY: [number, number, number] = [15, 23, 42];
const GRAY: [number, number, number] = [100, 116, 139];
const BORDER: [number, number, number] = [226, 232, 240];
const ORANGE: [number, number, number] = [241, 138, 69];
const RED: [number, number, number] = [220, 38, 38];

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 10;

const LOGO_SRC = "/logo_novo_p.png";
const LOGO_W = 24;
const LOGO_H = (LOGO_W * 244) / 351;

const imageDataUrlCache = new Map<string, Promise<string | null>>();

function loadImageDataUrl(src: string): Promise<string | null> {
  let promise = imageDataUrlCache.get(src);
  if (!promise) {
    promise = (async () => {
      let objectUrl: string | null = null;
      try {
        const res = await fetch(src);
        if (!res.ok) return null;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const element = new Image();
          element.onload = () => resolve(element);
          element.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`));
          element.src = objectUrl as string;
        });
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(image, 0, 0);
        return canvas.toDataURL("image/png");
      } catch {
        return null;
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    })();
    imageDataUrlCache.set(src, promise);
  }
  return promise;
}

let logoDataUrlPromise: Promise<string | null> | null = null;

async function loadLogoDataUrl(): Promise<string | null> {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = loadImageDataUrl(LOGO_SRC);
  }
  return logoDataUrlPromise;
}

function cmykLines(color: DominantColor): string[] {
  const c = color.cmykPrint ?? color.cmykApprox;
  return [`C: ${c.c}%`, `M: ${c.m}%`, `Y: ${c.y}%`, `K: ${c.k}%`];
}

export function fitImageToFrame(
  result: AnalysisResult,
  frameX: number,
  frameY: number,
  frameW: number,
  frameH: number,
) {
  const ratio = (result.imageHeight || 1) / Math.max(1, result.imageWidth || 1);
  let width = frameW;
  let height = width * ratio;
  if (height > frameH) {
    height = frameH;
    width = height / ratio;
  }
  return {
    x: frameX + (frameW - width) / 2,
    y: frameY + (frameH - height) / 2,
    width,
    height,
  };
}

async function drawTarjaOverlay(
  doc: jsPDF,
  result: AnalysisResult,
  fitted: { x: number; y: number; width: number; height: number },
) {
  const tarja = computeTarjaOverlay(
    result.magneticStripePosition,
    fitted.x,
    fitted.y,
    fitted.width,
    fitted.height,
  );
  if (!tarja) return;
  const url = await loadImageDataUrl(tarja.src);
  if (url) {
    doc.addImage(url, "PNG", tarja.x, tarja.y, tarja.w, tarja.h);
  }
}

async function drawChipOverlay(
  doc: jsPDF,
  result: AnalysisResult,
  fitted: { x: number; y: number; width: number; height: number },
) {
  if (!result.chipPosition) return;
  const chipUrl = await loadImageDataUrl("/chip.png");
  if (!chipUrl) return;
  const chipW = 7.92;
  const chipH = 5.87;
  let x = fitted.x + 4;
  let y = fitted.y + 4;
  if (result.chipPosition === "top-right") {
    x = fitted.x + fitted.width - 4 - chipW;
  } else if (result.chipPosition === "bottom-left") {
    y = fitted.y + fitted.height - 4 - chipH;
  } else if (result.chipPosition === "bottom-right") {
    x = fitted.x + fitted.width - 4 - chipW;
    y = fitted.y + fitted.height - 4 - chipH;
  }
  doc.addImage(chipUrl, "PNG", x, y, chipW, chipH);
}

function drawPalette(doc: jsPDF, palette: ApprovalPalette, result: AnalysisResult) {
  const paletteContentOffset = 2;
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.3);
  doc.line(palette.x - 2, palette.y, palette.x - 2, palette.y + palette.h);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text("PALETA IDENTIFICADA", palette.x, palette.headerY + paletteContentOffset);

  doc.setFontSize(6);
  doc.setTextColor(...RED);
  const subtitle = `${result.colors.length} cor(es) entre ${result.sampledPixels.toLocaleString("pt-BR")} pixels amostrados · ${
    result.mode === "predominantes" ? "por área ocupada" : "por destaque visual"
  }`;
  const subtitleLines = doc.splitTextToSize(subtitle, palette.w - 1);
  doc.text(subtitleLines, palette.x, palette.subtitleY + paletteContentOffset);

  palette.boxes.forEach((box) => {
    const { color } = box;
    const boxY = box.y + paletteContentOffset;
    const hasName = Boolean(color.name && color.name.trim());
    doc.setFillColor(255, 255, 255);
    doc.rect(box.x, boxY, box.w, box.h, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.rect(box.x, boxY, box.w, box.h, "S");

    doc.setFillColor(color.rgb.r, color.rgb.g, color.rgb.b);
    doc.rect(box.x, boxY, box.w, 3.6, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.15);
    doc.line(box.x, boxY + 3.6, box.x + box.w, boxY + 3.6);

    doc.setFont("courier", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    if (hasName) {
      const lines = doc.splitTextToSize(color.name, box.w - 4);
      const shown = lines.slice(0, 2);
      const lineH = 3.2;
      const startY = boxY + box.h / 2 - (shown.length * lineH) / 2 + 1.6;
      shown.forEach((line: string, i: number) => {
        doc.text(String(line), box.x + box.w / 2, startY + i * lineH, { align: "center" });
      });
    } else {
      const lines = cmykLines(color);
      const lineH = 2.8;
      const contentH = box.h - 3.6;
      const startY = boxY + 3.6 + (contentH - lines.length * lineH) / 2 + 2.2;
      lines.forEach((line, i) => {
        doc.text(line, box.x + 1.2, startY + i * lineH);
      });
    }
  });
}

export interface ApprovalPageInput {
  result: AnalysisResult;
  previewDataUrl: string;
  verso?: {
    result: AnalysisResult;
    previewDataUrl: string;
  };
}

export interface ApprovalExportFile {
  fileName: string;
  dataUrl: string;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

export function approvalExportFileName(imageName: string, extension: "pdf" | "jpg"): string {
  const base = imageName.replace(/\.[^.]+$/, "") || "analise";
  const approvalBase = /^frente_/i.test(base)
    ? base.replace(/^frente_/i, "aprovacao_")
    : `aprovacao_${base}`;
  return `${approvalBase}.${extension}`;
}

export async function exportApprovalPdf(
  result: AnalysisResult,
  previewDataUrl: string,
  job?: JobData | null,
): Promise<ApprovalExportFile> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await drawApprovalPage(doc, { result, previewDataUrl }, job);
  const blob = doc.output("blob");
  const fileName = approvalExportFileName(result.imageName, "pdf");
  downloadBlob(blob, fileName);
  return { fileName, dataUrl: await blobToDataUrl(blob) };
}

export async function exportCombinedApprovalPdf(
  pages: ApprovalPageInput[],
  job?: JobData | null,
): Promise<ApprovalExportFile | null> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const validPages = pages.filter((p) => p.result.colors.length > 0);

  if (validPages.length === 0) return null;

  await drawApprovalPage(doc, { ...validPages[0], verso: validPages[1] }, job);
  for (let i = 2; i < validPages.length; i++) {
    doc.addPage("a4", "portrait");
    await drawApprovalPage(doc, validPages[i], job);
  }

  const blob = doc.output("blob");
  const fileName = approvalExportFileName(validPages[0].result.imageName, "pdf");
  downloadBlob(blob, fileName);
  return { fileName, dataUrl: await blobToDataUrl(blob) };
}

async function drawApprovalPage(
  doc: jsPDF,
  { result, previewDataUrl, verso }: ApprovalPageInput,
  job?: JobData | null,
) {
  const logoUrl = await loadLogoDataUrl();
  if (logoUrl) {
    doc.addImage(logoUrl, "PNG", MARGIN, MARGIN, LOGO_W, LOGO_H);
  }

  doc.setFont("helvetica", "bold");
  const titleX = MARGIN + LOGO_W + 2;
  const titleW = PAGE_W - MARGIN - titleX;
  const titleH = 16.5;
  const titleY = MARGIN + (LOGO_H - titleH) / 2;
  doc.setDrawColor(241, 138, 69);
  doc.setLineWidth(0.28);
  doc.roundedRect(titleX, titleY, titleW, titleH, 1.5, 1.5, "S");
  const caption = "LAYOUT VIRTUAL PARA APROVAÇÃO E FICHA TÉCNICA DE PRODUÇÃO";
  const captionFontSize = 7.5;
  const captionPadX = 2.5;
  const captionH = 4;
  doc.setFontSize(captionFontSize);
  const captionW = doc.getTextWidth(caption) + captionPadX * 2;
  const captionX = titleX + (titleW - captionW) / 2;
  doc.setFillColor(255, 255, 255);
  doc.rect(captionX, titleY - captionH / 2, captionW, captionH, "F");
  doc.setTextColor(...NAVY);
  doc.text(caption, titleX + titleW / 2, titleY, { baseline: "middle", align: "center" });

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
  const rowSpacing = 4;
  doc.setFontSize(7);
  approvalRows.forEach((row, rowIndex) => {
    let columnStart = 0;
    row.forEach((field) => {
      const leftPadding = ["CLIENTE", "PRODUTO", "TAMANHO"].includes(field.label) ? 3 : 2.5;
      const fieldLeftX = titleX + (titleW * columnStart) / 3 + leftPadding;
      const fieldCenterY = titleY + titleH / 2 + (rowIndex - 1) * rowSpacing;
      doc.setFont("helvetica", "bold");
      doc.text(`${field.label}:`, fieldLeftX, fieldCenterY, {
        baseline: "middle",
        align: "left",
      });
      const labelWidth = doc.getTextWidth(`${field.label}: `);
      doc.setFont("helvetica", "normal");
      doc.text(field.value, fieldLeftX + labelWidth + 0.5, fieldCenterY, {
        baseline: "middle",
        align: "left",
      });
      columnStart += field.span;
    });
  });

  const headerBoxY = MARGIN + LOGO_H + 2;
  const headerBoxGap = 2;
  const headerBoxW = (PAGE_W - MARGIN * 2 - headerBoxGap) / 2;
  doc.setDrawColor(241, 138, 69);
  doc.setLineWidth(0.28);
  doc.roundedRect(MARGIN, headerBoxY, headerBoxW, 16.5, 1.5, 1.5, "S");
  doc.roundedRect(MARGIN + headerBoxW + headerBoxGap, headerBoxY, headerBoxW, 16.5, 1.5, 1.5, "S");
  const technologyCaption = "TECNOLOGIA";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  const technologyCaptionW = doc.getTextWidth(technologyCaption) + 5;
  const technologyCaptionX = MARGIN + (headerBoxW - technologyCaptionW) / 2;
  doc.setFillColor(255, 255, 255);
  doc.rect(technologyCaptionX, headerBoxY - 2, technologyCaptionW, 4, "F");
  doc.setTextColor(...NAVY);
  doc.text(technologyCaption, MARGIN + headerBoxW / 2, headerBoxY, {
    baseline: "middle",
    align: "center",
  });
  const finishingCaption = "ACABAMENTO";
  const finishingCaptionW = doc.getTextWidth(finishingCaption) + 5;
  const finishingBoxX = MARGIN + headerBoxW + headerBoxGap;
  const finishingCaptionX = finishingBoxX + (headerBoxW - finishingCaptionW) / 2;
  doc.setFillColor(255, 255, 255);
  doc.rect(finishingCaptionX, headerBoxY - 2, finishingCaptionW, 4, "F");
   doc.text(finishingCaption, finishingBoxX + headerBoxW / 2, headerBoxY, {
     baseline: "middle",
     align: "center",
   });
   doc.setFont("helvetica", "normal");
   doc.setFontSize(8);
   doc.text(valueOrPlaceholder(job?.acabamento), finishingBoxX + headerBoxW / 2, headerBoxY + 8.5, {
     baseline: "middle",
     align: "center",
   });
   const technologyRows = [
    [
      {
        label: "TARJA MAGNÉTICA",
        value: job ? (job.tarjaMagnetica ? "SIM" : "NÃO") : "NÃO",
      },
      { label: "CHIP RFID", value: job ? (job.chipRfid ? "SIM" : "NÃO") : "NÃO" },
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
  doc.setFontSize(7);
  technologyRows.forEach((row, rowIndex) => {
    row.forEach((field, columnIndex) => {
      const fieldLeftX = MARGIN + (headerBoxW * columnIndex) / 2 + 3;
      const fieldCenterY = headerBoxY + 16.5 / 2 + (rowIndex - 1) * 4;
      doc.setFont("helvetica", "bold");
      doc.text(`${field.label}:`, fieldLeftX, fieldCenterY, {
        baseline: "middle",
        align: "left",
      });
      const labelWidth = doc.getTextWidth(`${field.label}: `);
      doc.setFont("helvetica", "normal");
      doc.text(field.value, fieldLeftX + labelWidth + 0.5, fieldCenterY, {
        baseline: "middle",
        align: "left",
      });
    });
  });

  const labelW = 44;
  const labelH = 13;
  const labelGap = 5;
  const paletteW = 43.2;

  const { imgX, imgY, imgW, imgH, paletteX } = computeApprovalGeometry({
    result,
    pageW: PAGE_W,
    pageH: PAGE_H,
    margin: MARGIN,
    labelW,
    labelH,
    labelGap,
    hasVerso: Boolean(verso?.previewDataUrl?.trim()),
    imageMarginY: 10,
    paletteW,
  });

  const contentBoxY = MARGIN + 37;
  const hasFrontImage = Boolean(previewDataUrl?.trim());
  const hasVersoImage = Boolean(verso?.previewDataUrl?.trim());
  const frontBoxBottom = hasFrontImage ? imgY + imgH + 10 : contentBoxY;
  let boxesBottom = frontBoxBottom;
  const versoTopLineY = frontBoxBottom + 2;
  const versoBottomLineY = versoTopLineY + 8;
  if (hasFrontImage) {
    doc.setDrawColor(241, 138, 69);
    doc.setLineWidth(0.28);
    doc.roundedRect(
      MARGIN,
      contentBoxY,
      PAGE_W - MARGIN * 2,
      frontBoxBottom - contentBoxY,
      1.5,
      1.5,
      "S",
    );
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(220, 38, 38);
    doc.text("FRENTE", PAGE_W / 2, contentBoxY + 5, { align: "center", baseline: "middle" });
    doc.setDrawColor(241, 138, 69);
    doc.setLineWidth(0.28);
    doc.line(MARGIN, contentBoxY + 8, PAGE_W - MARGIN, contentBoxY + 8);

    const fittedFront = fitImageToFrame(result, imgX, imgY, imgW, imgH);
    await drawTarjaOverlay(doc, result, fittedFront);
    doc.addImage(
      previewDataUrl,
      "PNG",
      fittedFront.x,
      fittedFront.y,
      fittedFront.width,
      fittedFront.height,
    );
    await drawChipOverlay(doc, result, fittedFront);

    const frontPalette = computeApprovalPalette({
      colors: result.colors,
      x: paletteX,
      y: contentBoxY + 8,
      w: paletteW,
      h: frontBoxBottom - (contentBoxY + 8),
    });
    drawPalette(doc, frontPalette, result);
  }

  if (hasVersoImage && verso) {
    const versoY = versoBottomLineY + 10;
    const versoW = imgW;
    const versoH = imgH;
    if (versoH > 0 && versoW > 0) {
      const versoX = imgX;
      doc.setDrawColor(241, 138, 69);
      doc.setLineWidth(0.28);
      doc.line(MARGIN, versoTopLineY, PAGE_W - MARGIN, versoTopLineY);
      doc.setTextColor(220, 38, 38);
      doc.setFontSize(10);
      doc.text("VERSO", PAGE_W / 2, (versoTopLineY + versoBottomLineY) / 2, {
        align: "center",
        baseline: "middle",
      });
      doc.line(MARGIN, versoBottomLineY, PAGE_W - MARGIN, versoBottomLineY);
      const versoBoxBottom = versoY + versoH + 10;
      boxesBottom = versoBoxBottom;
      doc.setDrawColor(241, 138, 69);
      doc.setLineWidth(0.28);
      doc.roundedRect(
        MARGIN,
        versoTopLineY,
        PAGE_W - MARGIN * 2,
        versoBoxBottom - versoTopLineY,
        1.5,
        1.5,
        "S",
      );
      const fittedVerso = fitImageToFrame(verso.result, versoX, versoY, versoW, versoH);
      await drawTarjaOverlay(doc, verso.result, fittedVerso);
      doc.addImage(
        verso.previewDataUrl,
        "PNG",
        fittedVerso.x,
        fittedVerso.y,
        fittedVerso.width,
        fittedVerso.height,
      );
      await drawChipOverlay(doc, verso.result, fittedVerso);
      const versoPalette = computeApprovalPalette({
        colors: verso.result.colors,
        x: paletteX,
        y: versoBottomLineY,
        w: paletteW,
        h: versoBoxBottom - versoBottomLineY,
      });
      drawPalette(doc, versoPalette, verso.result);
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...RED);
  doc.text("ATENÇÃO:", MARGIN, PAGE_H - MARGIN - 35);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(0, 0, 0);
  const attentionText = doc.splitTextToSize(
    "Por favor, verifique cuidadosamente a arte, as cores e a ortografia antes de aprovar o layout. Após a aprovação final, a responsabilidade pelo layout passa a ser exclusivamente do cliente. Informamos que todos os elementos do layout, incluindo logotipos e espaçamentos, podem ser ajustados em tamanho para se adequarem ao nosso gabarito. Ressaltamos ainda que as cores apresentadas podem sofrer variações de até 10% em comparação à última produção.",
    PAGE_W - MARGIN * 2,
  );
  doc.text(attentionText, MARGIN, PAGE_H - MARGIN - 29, { lineHeightFactor: 1.35 });

  const boxGap = 1;
  const boxW = (PAGE_W - MARGIN * 2 - boxGap * 5) / 6;
  const boxH = 11;
  const boxesY = PAGE_H - MARGIN - 17;
  doc.setDrawColor(...ORANGE);
  doc.setLineWidth(0.28);
  const boxLabels: Record<number, string[]> = {
    0: ["PRÉ IMPRESSÃO", "GESTOR"],
    1: ["OFFSET SILK", "GESTOR"],
    2: ["PONTILHAÇÃO", "GESTOR"],
    3: ["LAMINAÇÃO", "GESTOR"],
    4: ["SELEÇÃO", "GESTOR"],
    5: ["FATURAMENTO", "GESTOR"],
  };
  for (let r = 0; r < 1; r++) {
    for (let c = 0; c < 6; c++) {
      const x = MARGIN + c * (boxW + boxGap);
      const y = boxesY + r * (boxH + boxGap);
      doc.roundedRect(x, y, boxW, boxH, 1.5, 1.5, "S");
      doc.line(x + boxW / 2, y, x + boxW / 2, y + boxH);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5);
      doc.setTextColor(0, 0, 0);
      doc.text(boxLabels[c][0], x + boxW / 4, y + 3.5, { align: "center" });
      doc.text(boxLabels[c][1], x + (3 * boxW) / 4, y + 3.5, { align: "center" });
    }
  }

  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.8);
  doc.setTextColor(...GRAY);
  const wrapped = doc.splitTextToSize(
    `Aviso: ${CMYK_DISCLAIMER}`,
    PAGE_W - MARGIN * 2,
  );
  doc.text(wrapped, MARGIN, PAGE_H - MARGIN - 3);
}
