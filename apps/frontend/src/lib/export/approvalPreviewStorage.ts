import type { AnalysisResult, JobData } from "@/lib/types";

const KEY = "croma-studio:approval-preview";

export interface ApprovalPreviewItem {
  result: AnalysisResult;
  previewDataUrl: string;
}

export interface ApprovalPreviewSession {
  pages: ApprovalPreviewItem[];
  job: JobData | null;
  jobId: string | null;
  savedAt: number;
}

export function saveApprovalPreview(data: {
  pages: ApprovalPreviewItem[];
  job?: JobData | null;
  jobId?: string | null;
}): void {
  const payload: ApprovalPreviewSession = {
    pages: data.pages,
    job: data.job ?? null,
    jobId: data.jobId ?? null,
    savedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* sessionStorage cheio ou indisponível */
  }
}

export function loadApprovalPreview(): ApprovalPreviewSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ApprovalPreviewSession;
    if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}
