"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { ApprovalPreviewPage } from "@/components/ApprovalPreview";
import { saveRemoteExport } from "@/lib/api/client";
import { approvalExportFileName } from "@/lib/export/approvalPdf";
import { loadApprovalPreview } from "@/lib/export/approvalPreviewStorage";
import type { ApprovalPreviewSession } from "@/lib/export/approvalPreviewStorage";

export default function PreviewPage() {
  const router = useRouter();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [session] = useState<ApprovalPreviewSession | null>(() =>
    typeof window === "undefined" ? null : loadApprovalPreview(),
  );
  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState<number | null>(5);

  async function handleDownload() {
    if (session === null) return;
    setExporting(true);
    try {
      const { exportCombinedApprovalPdf } = await import("@/lib/export/approvalPdf");
      const exported = await exportCombinedApprovalPdf(session.pages, session.job ?? undefined);
      if (exported && session.jobId) {
        await saveRemoteExport(session.jobId, "pdf", exported.fileName, exported.dataUrl);
      }
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadImage() {
    if (session === null || !pageRef.current) return;
    setExporting(true);
    try {
      const { toJpeg } = await import("html-to-image");
      const sourceUrl = await toJpeg(pageRef.current, {
        cacheBust: true,
        quality: 0.95,
        pixelRatio: 2,
      });
      const source = new Image();
      source.src = sourceUrl;
      await new Promise<void>((resolve, reject) => {
        source.onload = () => resolve();
        source.onerror = () => reject(new Error("Não foi possível gerar a imagem."));
      });

      const canvas = document.createElement("canvas");
      canvas.width = 2480;
      canvas.height = 3508;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Não foi possível preparar a imagem.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(source, 0, 0, canvas.width, canvas.height);

      const link = document.createElement("a");
      link.download = approvalExportFileName(session.pages[0].result.imageName, "jpg");
      link.href = canvas.toDataURL("image/jpeg", 0.95);
      link.click();
      if (session.jobId) {
        await saveRemoteExport(session.jobId, "jpg", link.download, link.href);
      }
    } finally {
      setExporting(false);
    }
  }

  if (session === null) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16">
        <p className="text-sm text-slate-500">
          Nenhum layout de aprovação encontrado. Analise uma imagem primeiro.
        </p>
        <button
          type="button"
          onClick={() => router.push("/analise")}
          className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700"
        >
          Voltar para a análise
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800">Pré-visualização do layout de aprovação</h1>
          <p className="text-sm text-slate-500">A4 retrato · confira antes de gerar o PDF</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 inline-flex items-center overflow-hidden rounded-lg border border-slate-300 bg-white">
            <button
              type="button"
              onClick={() => setZoom((z) => (z === null ? 2.5 : Math.max(0.8, z - 0.5)))}
              disabled={exporting}
              className="px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              aria-label="Diminuir zoom"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom(null)}
              disabled={exporting}
              className="border-x border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              aria-label="Ajustar zoom à tela"
            >
              {zoom === null ? "Auto" : `${Math.round(zoom * 100)}%`}
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => (z === null ? 2.5 : z + 0.5))}
              disabled={exporting}
              className="px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
              aria-label="Aumentar zoom"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={() => router.push("/analise")}
            disabled={exporting}
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {exporting ? "Gerando…" : "Baixar PDF"}
          </button>
          <button
            type="button"
            onClick={() => void handleDownloadImage()}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16.5V19a1 1 0 001 1h14a1 1 0 001-1v-2.5M7 10l5-5 5 5M12 5v11" />
            </svg>
            {exporting ? "Gerando…" : "Baixar Imagem"}
          </button>
        </div>
      </div>

      <div className="flex flex-col items-center gap-12">
        {session.pages.map((page, i) => {
          if (i === 1) return null;
          const verso = i === 0 ? session.pages[1] : undefined;
          return (
            <section
              key={page.result.imageName}
              className="flex w-full max-w-5xl flex-col items-center gap-3"
            >
              <span className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                {i === 0 ? "Frente" : `Verso ${i}`} · {page.result.imageName}
              </span>
              <div className="w-full">
                <ApprovalPreviewPage
                  result={page.result}
                  previewDataUrl={page.previewDataUrl}
                  verso={verso}
                  job={session.job}
                  scaleOverride={zoom}
                  captureRef={pageRef}
                />
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
