import { CMYK_DISCLAIMER } from "@/lib/color/analysis";
import { downloadBlob } from "@/lib/export/download";
import type { AnalysisResult, DominantColor, JobData } from "@/lib/types";
import type jsPDF from "jspdf";

const NAVY: [number, number, number] = [15, 23, 42];
const GRAY: [number, number, number] = [100, 116, 139];
const BORDER: [number, number, number] = [226, 232, 240];

function formatPercent(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function formatCmykText(color: DominantColor): string {
  const c = color.cmykPrint ?? color.cmykApprox;
  return `C: ${c.c}%  M: ${c.m}%  Y: ${c.y}%  K: ${c.k}%`;
}

export interface PdfPageInput {
  result: AnalysisResult;
  previewDataUrl: string;
}

function buildJobHeaderLine(job?: JobData | null): string {
  if (!job) return "";
  const parts: string[] = [];
  if (job.cliente.trim()) parts.push(`Cliente: ${job.cliente.trim()}`);
  if (job.produto.trim()) parts.push(`Produto: ${job.produto.trim()}`);
  if (job.material.trim()) parts.push(`Material: ${job.material.trim()}`);
  if (job.tamanho.trim()) parts.push(`Tamanho: ${job.tamanho.trim()}`);
  if (job.cores.trim()) parts.push(`Cores: ${job.cores.trim()}`);
  if (job.tarjaMagnetica)
    parts.push(`Tarja magnética: Sim${job.tipoTarja ? ` (${job.tipoTarja})` : ""}`);
  if (job.chipRfid) parts.push(`Chip RFID: Sim${job.tipoChip ? ` (${job.tipoChip})` : ""}`);
  if (job.acabamento.trim()) parts.push(`Acabamento: ${job.acabamento.trim()}`);
  if (job.observacoes.trim()) parts.push(`Obs.: ${job.observacoes.trim()}`);
  return parts.join("   ·   ");
}

export async function exportPdf(
  result: AnalysisResult,
  previewDataUrl: string,
  job?: JobData | null,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  drawPdfPage(doc, { result, previewDataUrl }, job);
  const blob = doc.output("blob");
  const base = result.imageName.replace(/\.[^.]+$/, "") || "analise";
  downloadBlob(blob, `${base}-ficha-de-cores.pdf`);
}

export async function exportCombinedPdf(
  pages: PdfPageInput[],
  job?: JobData | null,
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const validPages = pages.filter((p) => p.result.colors.length > 0);

  if (validPages.length === 0) return;

  drawPdfPage(doc, validPages[0], job);
  for (let i = 1; i < validPages.length; i++) {
    doc.addPage("a4", "landscape");
    drawPdfPage(doc, validPages[i], job);
  }

  const blob = doc.output("blob");
  const base =
    validPages[0].result.imageName.replace(/\.[^.]+$/, "") || "analise";
  downloadBlob(blob, `${base}-frente-e-verso-ficha-de-cores.pdf`);
}

function drawPdfPage(
  doc: jsPDF,
  { result, previewDataUrl }: PdfPageInput,
  job?: JobData | null,
) {
  const pageWidth = 297;
  const margin = 12;
  const contentRight = pageWidth - margin;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 10, "F");

  doc.setTextColor(...NAVY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Análise de Cores Gráficas", margin, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  const info = `${result.imageName}  ·  ${result.imageWidth} × ${result.imageHeight}px  ·  ${new Date().toLocaleDateString("pt-BR")}  ·  ${result.mode === "predominantes" ? "Cores predominantes" : "Cores de destaque"}  ·  Perfil: ${result.profileName}`;
  doc.text(info, margin, 25);

  const jobLine = buildJobHeaderLine(job);
  if (jobLine) {
    doc.setFontSize(7);
    const wrapped = doc.splitTextToSize(jobLine, contentRight - margin);
    doc.text(wrapped, margin, 28);
  }

  const headerBottom = jobLine ? 30.5 : 28;
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, headerBottom, contentRight, headerBottom);

  const top = headerBottom + 4;
  const previewMaxW = 78;
  const previewMaxH = 58;
  let previewW = previewMaxW;
  let previewH = previewMaxH;
  const img = new Image();
  img.src = previewDataUrl;
  if (img.width && img.height) {
    const ratio = img.height / img.width;
    previewW = Math.min(previewMaxW, previewMaxH / ratio);
    previewH = previewW * ratio;
  }
  try {
    doc.addImage(previewDataUrl, "PNG", margin, top, previewW, previewH);
  } catch {
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, top, previewW, previewH, "F");
    doc.setTextColor(...GRAY);
    doc.text("Pré-visualização indisponível", margin + 5, top + 20);
  }

  const stripX = margin + previewW + 8;
  const stripY = top + 2;
  const stripW = contentRight - stripX;
  const stripH = 20;
  const n = result.colors.length;
  const swatchW = stripW / n;

  result.colors.forEach((color, index) => {
    const x = stripX + index * swatchW;
    doc.setFillColor(color.rgb.r, color.rgb.g, color.rgb.b);
    doc.rect(x, stripY, swatchW - 1.5, stripH, "F");
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.rect(x, stripY, swatchW - 1.5, stripH, "S");
  });

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(margin, stripY + stripH + 4, contentRight, stripY + stripH + 4);

  const gridX = margin;
  const gridTop = stripY + stripH + 8;
  const cols = 3;
  const rows = Math.ceil(result.colors.length / cols);
  const cardW = (contentRight - gridX - (cols - 1) * 5) / cols;
  const cardH = 46;

  result.colors.forEach((color, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = gridX + col * (cardW + 5);
    const y = gridTop + row * (cardH + 5);

    doc.setFillColor(248, 250, 252);
    doc.rect(x, y, cardW, cardH, "F");
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.rect(x, y, cardW, cardH, "S");

    const swatchSize = 34;
    doc.setFillColor(color.rgb.r, color.rgb.g, color.rgb.b);
    doc.rect(x + 3, y + 3, swatchSize, swatchSize, "F");

    const textX = x + swatchSize + 8;
    const maxTextW = cardW - swatchSize - 12;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    const title = color.name
      ? `Cor ${color.rank} — ${formatPercent(color.percentage)} · ${color.name}`
      : `Cor ${color.rank} — ${formatPercent(color.percentage)}`;
    doc.text(doc.splitTextToSize(title, maxTextW), textX, y + 7);

    doc.setFont("courier", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...NAVY);
    doc.text(color.hex, textX, y + 14);

    doc.setFont("courier", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(`RGB: ${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}`, textX, y + 21);
    doc.text(`CMYK: ${formatCmykText(color)}`, textX, y + 27);
    if (color.cmykPrint) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.5);
      doc.text(`Perfil: ${result.profileName}`, textX, y + 32);
    }
  });

  const disclaimerY = gridTop + rows * (cardH + 5) + 4;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(6.8);
  doc.setTextColor(...GRAY);
  const wrapped = doc.splitTextToSize(
    `Aviso: ${CMYK_DISCLAIMER}`,
    contentRight - margin,
  );
  doc.text(wrapped, margin, disclaimerY);
}
