import type { AnalysisResult, JobData } from "@/lib/types";

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

const DB_NAME = "croma-studio";
const STORE_NAME = "kv";
const KEY = "approval-preview";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponível."));
  });
}

async function writeRecord(value: unknown): Promise<boolean> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return true;
  } catch {
    return false;
  }
}

async function readRecord(): Promise<unknown> {
  try {
    const db = await openDatabase();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const request = transaction.objectStore(STORE_NAME).get(KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return undefined;
  }
}

async function deleteRecord(): Promise<void> {
  try {
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    /* storage indisponível */
  }
}

export async function saveApprovalPreview(data: {
  pages: ApprovalPreviewItem[];
  job?: JobData | null;
  jobId?: string | null;
}): Promise<boolean> {
  const payload: ApprovalPreviewSession = {
    pages: data.pages,
    job: data.job ?? null,
    jobId: data.jobId ?? null,
    savedAt: Date.now(),
  };
  return writeRecord(payload);
}

export async function loadApprovalPreview(): Promise<ApprovalPreviewSession | null> {
  const parsed = (await readRecord()) as ApprovalPreviewSession | undefined;
  if (!parsed) return null;
  if (!Array.isArray(parsed.pages) || parsed.pages.length === 0) return null;
  return parsed;
}

export async function clearApprovalPreview(): Promise<void> {
  await deleteRecord();
}
