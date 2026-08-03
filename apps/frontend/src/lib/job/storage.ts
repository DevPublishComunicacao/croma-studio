"use client";

import type { JobData } from "@/lib/types";

const STORAGE_KEY = "croma-studio:job-data";
const JOB_ID_KEY = "croma-studio:job-id";

export const EMPTY_JOB: JobData = {
  numeroPedido: "",
  sistema: "",
  vendedor: "",
  cliente: "",
  produto: "",
  material: "",
  tamanho: "",
  espessura: "",
  cores: "",
  tarjaMagnetica: false,
  tipoTarja: "",
  chipRfid: false,
  tipoChip: "",
  infrared: false,
  infraredCor: "",
  acabamento: "",
  observacoes: "",
};

export function saveJobData(data: JobData): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* storage indisponível */
  }
}

export function loadJobData(): JobData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return { ...EMPTY_JOB, ...(JSON.parse(raw) as Partial<JobData>) };
  } catch {
    return null;
  }
}

export function clearJobData(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage indisponível */
  }
}

export function saveJobId(id: string): void {
  try {
    sessionStorage.setItem(JOB_ID_KEY, id);
  } catch {
    /* storage indisponível */
  }
}

export function loadJobId(): string | null {
  try {
    return sessionStorage.getItem(JOB_ID_KEY);
  } catch {
    return null;
  }
}

export function clearJobId(): void {
  try {
    sessionStorage.removeItem(JOB_ID_KEY);
  } catch {
    /* storage indisponível */
  }
}
