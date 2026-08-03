import type { JobData } from "@/lib/types";

export function buildJobHeaderLines(job?: JobData | null): string[] {
  if (!job) return [];
  const parts: string[] = [];
  if (job.cliente.trim()) parts.push(`Cliente: ${job.cliente.trim()}`);
  if (job.produto.trim()) parts.push(`Produto: ${job.produto.trim()}`);
  if (job.material.trim()) parts.push(`Material: ${job.material.trim()}`);
  if (job.tamanho.trim()) parts.push(`Tamanho: ${job.tamanho.trim()}`);
  if (job.espessura.trim()) parts.push(`Espessura: ${job.espessura.trim()}`);
  if (job.cores.trim()) parts.push(`Cores: ${job.cores.trim()}`);
  if (job.tarjaMagnetica)
    parts.push(`Tarja magnética: Sim${job.tipoTarja ? ` (${job.tipoTarja})` : ""}`);
  if (job.chipRfid) parts.push(`Chip RFID: Sim${job.tipoChip ? ` (${job.tipoChip})` : ""}`);
  if (job.acabamento.trim()) parts.push(`Acabamento: ${job.acabamento.trim()}`);
  if (job.observacoes.trim()) parts.push(`Obs.: ${job.observacoes.trim()}`);
  return parts;
}
