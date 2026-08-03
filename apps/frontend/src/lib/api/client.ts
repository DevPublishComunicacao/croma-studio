import type { AnalysisResult, JobData, LoadedImage } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export interface RemoteJobSummary extends JobData {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemoteFace {
  id: string;
  side: "frente" | "verso";
  imageName: string;
  format: string;
  imageWidth: number;
  imageHeight: number;
  previewDataUrl: string;
  analysis: AnalysisResult;
  options: AnalysisResult["options"];
  colors: AnalysisResult["colors"];
  createdAt: string;
  updatedAt: string;
}

async function request<T>(path: string, init: RequestInit): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
    if (!response.ok) {
      console.warn(`Croma API ${response.status}: ${path}`);
      return null;
    }
    return (await response.json()) as T;
  } catch (error) {
    console.warn("Croma API indisponível; dados mantidos localmente.", error);
    return null;
  }
}

export async function createRemoteJob(job: JobData): Promise<string | null> {
  const response = await request<{ job: { id: string } }>("/api/v1/jobs", {
    method: "POST",
    body: JSON.stringify(job),
  });
  return response?.job.id ?? null;
}

export async function listRemoteJobs(cursor?: string | null): Promise<{
  items: RemoteJobSummary[];
  nextCursor: string | null;
} | null> {
  const query = new URLSearchParams({ limit: "25" });
  if (cursor) query.set("cursor", cursor);
  return request(`/api/v1/jobs?${query.toString()}`, { method: "GET" });
}

export async function getRemoteJob(jobId: string): Promise<{
  job: RemoteJobSummary;
  faces: RemoteFace[];
} | null> {
  return request(`/api/v1/jobs/${jobId}`, { method: "GET" });
}

export async function updateRemoteJob(jobId: string, job: JobData): Promise<void> {
  await request(`/api/v1/jobs/${jobId}`, {
    method: "PATCH",
    body: JSON.stringify(job),
  });
}

export async function saveRemoteFace(
  jobId: string,
  side: "frente" | "verso",
  image: LoadedImage,
  result: AnalysisResult,
): Promise<void> {
  await request(`/api/v1/jobs/${jobId}/faces/${side}`, {
    method: "PUT",
    body: JSON.stringify({
      imageName: image.fileName,
      format: image.format,
      imageWidth: image.width,
      imageHeight: image.height,
      previewDataUrl: image.previewUrl,
      analysis: result,
      options: result.options,
      colors: result.colors,
    }),
  });
}

export async function saveRemoteExport(
  jobId: string,
  exportType: "pdf" | "jpg",
  fileName: string,
  dataUrl: string,
): Promise<void> {
  await request(`/api/v1/jobs/${jobId}/exports`, {
    method: "POST",
    body: JSON.stringify({ exportType, fileName, dataUrl }),
  });
}
