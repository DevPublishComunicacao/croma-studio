"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useGlobalLoading } from "@/components/GlobalLoadingProvider";

import { ApprovalPreviewPage } from "@/components/ApprovalPreview";
import { saveRemoteExport } from "@/lib/api/client";
import { approvalExportFileName } from "@/lib/export/approvalPdf";
import { loadApprovalPreview } from "@/lib/export/approvalPreviewStorage";
import type { ApprovalPreviewSession } from "@/lib/export/approvalPreviewStorage";
import { loadJobId } from "@/lib/job/storage";

type ExportKind = "pdf" | "image";
type ExportResolution = "low" | "medium" | "high";

const EXPORT_PROFILES: Record<
  ExportResolution,
  { label: string; description: string; width: number; height: number; pixelRatio: number; imageScale: number }
> = {
  low: {
    label: "Baixa",
    description: "Formato atual para visualização e compartilhamento.",
    width: 2480,
    height: 3508,
    pixelRatio: 2,
    imageScale: 1,
  },
  medium: {
    label: "Média",
    description: "Indicada para impressão doméstica.",
    width: 3508,
    height: 4961,
    pixelRatio: 3,
    imageScale: 1.5,
  },
  high: {
    label: "Alta",
    description: "Alta definição para envio à gráfica.",
    width: 4960,
    height: 7016,
    pixelRatio: 4,
    imageScale: 2,
  },
};

async function scaleDataUrl(src: string, scale: number): Promise<string> {
  if (scale === 1) return src;
  const image = new Image();
  image.src = src;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Não foi possível preparar a imagem para exportação."));
  });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar a imagem para exportação.");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export default function PreviewPage() {
  const router = useRouter();
  const { startLoading, stopLoading } = useGlobalLoading();
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [session, setSession] = useState<ApprovalPreviewSession | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState<number | null>(5);
  const [exportKind, setExportKind] = useState<ExportKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void loadApprovalPreview().then((stored) => {
        if (cancelled) return;
        const currentJobId = loadJobId();
        const session =
          stored && stored.jobId && currentJobId && stored.jobId !== currentJobId
            ? null
            : stored;
        setSession(session);
        setHydrated(true);
      });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      cancelled = true;
    };
  }, []);

  async function handleDownload(resolution: ExportResolution) {
    if (session === null) return;
    setExporting(true);
    startLoading("Gerando PDF...");
    try {
      const { exportCombinedApprovalPdf } = await import("@/lib/export/approvalPdf");
      const profile = EXPORT_PROFILES[resolution];
      const pages = await Promise.all(
        session.pages.map(async (page) => ({
          ...page,
          previewDataUrl: await scaleDataUrl(page.previewDataUrl, profile.imageScale),
        })),
      );
      const exported = await exportCombinedApprovalPdf(pages, session.job ?? undefined);
      if (exported && session.jobId) {
        await saveRemoteExport(session.jobId, "pdf", exported.fileName, exported.dataUrl);
      }
    } finally {
      setExporting(false);
      setExportKind(null);
      stopLoading();
    }
  }

  async function handleDownloadImage(resolution: ExportResolution) {
    if (session === null || !pageRef.current) return;
    setExporting(true);
    startLoading("Gerando imagem...");
    try {
      const profile = EXPORT_PROFILES[resolution];
      const { toJpeg } = await import("html-to-image");
      const sourceUrl = await toJpeg(pageRef.current, {
        cacheBust: true,
        quality: 0.95,
        pixelRatio: profile.pixelRatio,
      });
      const source = new Image();
      source.src = sourceUrl;
      await new Promise<void>((resolve, reject) => {
        source.onload = () => resolve();
        source.onerror = () => reject(new Error("Não foi possível gerar a imagem."));
      });

      const canvas = document.createElement("canvas");
       canvas.width = profile.width;
       canvas.height = profile.height;
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
      setExportKind(null);
      stopLoading();
    }
  }

  function openExport(kind: ExportKind) {
    if (!exporting) setExportKind(kind);
  }

  function closeExport() {
    if (!exporting) setExportKind(null);
  }

  function chooseResolution(resolution: ExportResolution) {
    if (exportKind === "pdf") void handleDownload(resolution);
    if (exportKind === "image") void handleDownloadImage(resolution);
  }

  if (!hydrated) {
    return (
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-orange-500" />
        <p className="text-sm text-slate-500">Carregando pré-visualização...</p>
      </main>
    );
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
             onClick={() => openExport("pdf")}
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
             onClick={() => openExport("image")}
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

      {exportKind && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeExport();
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-resolution-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="export-resolution-title" className="text-base font-bold text-slate-900">
                  Resolução da exportação
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Escolha a qualidade do {exportKind === "pdf" ? "PDF" : "arquivo de imagem"}.
                </p>
              </div>
              <button
                type="button"
                onClick={closeExport}
                className="rounded-lg px-2 py-1 text-xl leading-none text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Fechar seleção de resolução"
              >
                ×
              </button>
            </div>
            <div className="mt-5 grid gap-2">
              {(Object.keys(EXPORT_PROFILES) as ExportResolution[]).map((resolution) => {
                const profile = EXPORT_PROFILES[resolution];
                return (
                  <button
                    key={resolution}
                    type="button"
                    onClick={() => chooseResolution(resolution)}
                    className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-orange-400 hover:bg-orange-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                  >
                    <span>
                      <span className="block text-sm font-bold text-slate-800">{profile.label} resolução</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{profile.description}</span>
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      {profile.width} × {profile.height}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
