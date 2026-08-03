import { downloadBlob } from "@/lib/export/download";
import { CMYK_DISCLAIMER } from "@/lib/color/analysis";
import type { AnalysisResult, DominantColor, JobData } from "@/lib/types";

export function buildJson(result: AnalysisResult): string {
  const payload = {
    ferramenta: "Croma Studio — Análise de Cores Gráficas",
    imagem: {
      nome: result.imageName,
      dimensoes: {
        largura: result.imageWidth,
        altura: result.imageHeight,
      },
    },
    modoAnalise:
      result.mode === "predominantes"
        ? "Cores predominantes (área ocupada)"
        : "Cores de destaque (saturação, contraste e relevância visual)",
    perfilIcc: result.profileName,
    totalDePixelsAmostrados: result.sampledPixels,
    cores: result.colors.map((c) => ({
      posicao: c.rank,
      nome: c.name || null,
      percentual: Number(c.percentage.toFixed(2)),
      hexadecimal: c.hex,
      rgb: `${c.rgb.r}, ${c.rgb.g}, ${c.rgb.b}`,
      cmykAproximado: `${c.cmykApprox.c}%, ${c.cmykApprox.m}%, ${c.cmykApprox.y}%, ${c.cmykApprox.k}%`,
      cmykImpressao: c.cmykPrint
        ? `${c.cmykPrint.c}%, ${c.cmykPrint.m}%, ${c.cmykPrint.y}%, ${c.cmykPrint.k}%`
        : null,
    })),
    avisoCmyk: CMYK_DISCLAIMER,
    geradoEm: new Date().toISOString(),
  };

  return JSON.stringify(payload, null, 2);
}

export function exportJson(result: AnalysisResult) {
  const base = result.imageName.replace(/\.[^.]+$/, "") || "analise";
  const blob = new Blob([buildJson(result)], { type: "application/json;charset=utf-8" });
  downloadBlob(blob, `${base}-cores.json`);
}

export function buildCsv(result: AnalysisResult): string {
  const esc = (value: string | number) => {
    const str = String(value);
    return /[";\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines: string[] = [];
  lines.push(
    [
      "Posição",
      "Nome",
      "Percentual (%)",
      "Hex",
      "R",
      "G",
      "B",
      "C%",
      "M%",
      "Y%",
      "K%",
      "C% (Impressão)",
      "M% (Impressão)",
      "Y% (Impressão)",
      "K% (Impressão)",
    ]
      .map(esc)
      .join(";"),
  );

  result.colors.forEach((c: DominantColor) => {
    const decimal = (v: number) => v.toFixed(1).replace(".", ",");
    lines.push(
      [
        c.rank,
        c.name || "",
        decimal(c.percentage),
        c.hex,
        c.rgb.r,
        c.rgb.g,
        c.rgb.b,
        c.cmykApprox.c,
        c.cmykApprox.m,
        c.cmykApprox.y,
        c.cmykApprox.k,
        c.cmykPrint?.c ?? "",
        c.cmykPrint?.m ?? "",
        c.cmykPrint?.y ?? "",
        c.cmykPrint?.k ?? "",
      ]
        .map(esc)
        .join(";"),
    );
  });

  return lines.join("\r\n");
}

export function exportCsv(result: AnalysisResult) {
  const base = result.imageName.replace(/\.[^.]+$/, "") || "analise";
  const bom = "\uFEFF";
  const blob = new Blob([bom + buildCsv(result)], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, `${base}-cores.csv`);
}

export interface CombinedResultFace {
  face: string;
  result: AnalysisResult;
}

export function buildCombinedCsv(
  faces: CombinedResultFace[],
  job?: JobData | null,
): string {
  const esc = (value: string | number) => {
    const str = String(value);
    return /[";\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const lines: string[] = [];
  const jobLines = buildJobCsvLines(job);
  if (jobLines.length > 0) {
    lines.push(...jobLines.map(esc));
    lines.push("");
  }
  lines.push(
    ["Face", "Posição", "Nome", "Percentual (%)", "Hex", "R", "G", "B", "C%", "M%", "Y%", "K%", "C% (Impressão)", "M% (Impressão)", "Y% (Impressão)", "K% (Impressão)"]
      .map(esc)
      .join(";"),
  );

  faces.forEach(({ face, result }) => {
    result.colors.forEach((c: DominantColor) => {
      const decimal = (v: number) => v.toFixed(1).replace(".", ",");
      lines.push(
        [
          face,
          c.rank,
          c.name || "",
          decimal(c.percentage),
          c.hex,
          c.rgb.r,
          c.rgb.g,
          c.rgb.b,
          c.cmykApprox.c,
          c.cmykApprox.m,
          c.cmykApprox.y,
          c.cmykApprox.k,
          c.cmykPrint?.c ?? "",
          c.cmykPrint?.m ?? "",
          c.cmykPrint?.y ?? "",
          c.cmykPrint?.k ?? "",
        ]
          .map(esc)
          .join(";"),
      );
    });
  });

  return lines.join("\r\n");
}

function buildJobCsvLines(job?: JobData | null): string[] {
  if (!job) return [];
  const lines: string[] = [];
  if (job.cliente.trim()) lines.push(`Cliente;${job.cliente.trim()}`);
  if (job.produto.trim()) lines.push(`Produto;${job.produto.trim()}`);
  if (job.material.trim()) lines.push(`Material;${job.material.trim()}`);
  if (job.tamanho.trim()) lines.push(`Tamanho;${job.tamanho.trim()}`);
  if (job.espessura.trim()) lines.push(`Espessura;${job.espessura.trim()}`);
  if (job.cores.trim()) lines.push(`Cores;${job.cores.trim()}`);
  if (job.tarjaMagnetica)
    lines.push(`Tarja magnética;Sim${job.tipoTarja ? ` (${job.tipoTarja})` : ""}`);
  if (job.chipRfid) lines.push(`Chip RFID;Sim${job.tipoChip ? ` (${job.tipoChip})` : ""}`);
  if (job.acabamento.trim()) lines.push(`Acabamento;${job.acabamento.trim()}`);
  if (job.observacoes.trim()) lines.push(`Observações;${job.observacoes.trim()}`);
  return lines;
}

export function exportCombinedCsv(
  faces: CombinedResultFace[],
  fileName: string,
  job?: JobData | null,
) {
  const base = fileName.replace(/\.[^.]+$/, "") || "analise";
  const bom = "\uFEFF";
  const blob = new Blob([bom + buildCombinedCsv(faces, job)], {
    type: "text/csv;charset=utf-8",
  });
  downloadBlob(blob, `${base}-frente-e-verso-cores.csv`);
}

function buildJobJson(job?: JobData | null) {
  if (!job) return null;
  return {
    cliente: job.cliente.trim() || null,
    produto: job.produto.trim() || null,
    material: job.material.trim() || null,
    tamanho: job.tamanho.trim() || null,
    espessura: job.espessura.trim() || null,
    cores: job.cores.trim() || null,
    tarjaMagnetica: job.tarjaMagnetica
      ? `Sim${job.tipoTarja ? ` (${job.tipoTarja})` : ""}`
      : "Não",
    chipRfid: job.chipRfid ? `Sim${job.tipoChip ? ` (${job.tipoChip})` : ""}` : "Não",
    acabamento: job.acabamento.trim() || null,
    observacoes: job.observacoes.trim() || null,
  };
}

export function buildCombinedJson(
  faces: CombinedResultFace[],
  job?: JobData | null,
): string {
  const payload = {
    ferramenta: "Croma Studio — Análise de Cores Gráficas",
    pedido: buildJobJson(job),
    faces: faces.map(({ face, result }) => ({
      face,
      imagem: {
        nome: result.imageName,
        dimensoes: {
          largura: result.imageWidth,
          altura: result.imageHeight,
        },
      },
      modoAnalise:
        result.mode === "predominantes"
          ? "Cores predominantes (área ocupada)"
          : "Cores de destaque (saturação, contraste e relevância visual)",
      perfilIcc: result.profileName,
      totalDePixelsAmostrados: result.sampledPixels,
      cores: result.colors.map((c) => ({
        posicao: c.rank,
        nome: c.name || null,
        percentual: Number(c.percentage.toFixed(2)),
        hexadecimal: c.hex,
        rgb: `${c.rgb.r}, ${c.rgb.g}, ${c.rgb.b}`,
        cmykAproximado: `${c.cmykApprox.c}%, ${c.cmykApprox.m}%, ${c.cmykApprox.y}%, ${c.cmykApprox.k}%`,
        cmykImpressao: c.cmykPrint
          ? `${c.cmykPrint.c}%, ${c.cmykPrint.m}%, ${c.cmykPrint.y}%, ${c.cmykPrint.k}%`
          : null,
      })),
    })),
    avisoCmyk: CMYK_DISCLAIMER,
    geradoEm: new Date().toISOString(),
  };

  return JSON.stringify(payload, null, 2);
}

export function exportCombinedJson(
  faces: CombinedResultFace[],
  fileName: string,
  job?: JobData | null,
) {
  const base = fileName.replace(/\.[^.]+$/, "") || "analise";
  const blob = new Blob([buildCombinedJson(faces, job)], {
    type: "application/json;charset=utf-8",
  });
  downloadBlob(blob, `${base}-frente-e-verso-cores.json`);
}
