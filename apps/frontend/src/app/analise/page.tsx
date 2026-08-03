"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { ExportBar } from "@/components/ExportBar";
import { CmykNotice } from "@/components/CmykNotice";
import { FaceSection, type ChipPosition, type FaceSectionHandle } from "@/components/FaceSection";
import { OptionsPanel } from "@/components/OptionsPanel";

import { exportCombinedPalettePng } from "@/lib/export/palettePng";
import { exportCombinedPdf } from "@/lib/export/pdfExport";
import { exportCombinedCsv, exportCombinedJson } from "@/lib/export/structuredExport";
import { saveApprovalPreview } from "@/lib/export/approvalPreviewStorage";
import { getRemoteJob, saveRemoteFace, type RemoteFace } from "@/lib/api/client";
import { loadJobData, loadJobId } from "@/lib/job/storage";
import type { AnalysisOptions, AnalysisMode, JobData } from "@/lib/types";

const DEFAULT_OPTIONS: AnalysisOptions = {
  mode: "destaque",
  ignoreWhite: true,
  ignoreBlack: true,
  ignoreGrays: false,
  ignoreTransparentBackground: true,
  iccProfileId: "fogra39",
};

function mirrorChip(position: ChipPosition | null): ChipPosition | null {
  if (!position) return null;
  switch (position) {
    case "top-left":
      return "top-right";
    case "top-right":
      return "top-left";
    case "bottom-left":
      return "bottom-right";
    case "bottom-right":
      return "bottom-left";
  }
}

type Orientation = "vertical" | "horizontal" | "square";

function orientationOf(width: number, height: number): Orientation {
  if (height > width) return "vertical";
  if (width > height) return "horizontal";
  return "square";
}

interface CustomIcc {
  buffer: ArrayBuffer;
  name: string;
}

export default function Analise() {
  const [options, setOptions] = useState<AnalysisOptions>(DEFAULT_OPTIONS);
  const [customIcc, setCustomIcc] = useState<CustomIcc | null>(null);
  const [combinedBusy, setCombinedBusy] = useState(false);
  const [faceImages, setFaceImages] = useState({ frente: false, verso: false });

  const router = useRouter();
  const optionsRef = useRef(DEFAULT_OPTIONS);
  const customIccRef = useRef<CustomIcc | null>(null);
  const frenteRef = useRef<FaceSectionHandle | null>(null);
  const versoRef = useRef<FaceSectionHandle | null>(null);
  const jobRef = useRef<JobData | null>(loadJobData());
  const [jobId] = useState<string | null>(() => loadJobId());
  const [savedFaces, setSavedFaces] = useState<RemoteFace[]>([]);

  useEffect(() => {
    if (!jobId) return;
    void getRemoteJob(jobId).then((remote) => {
      if (remote) setSavedFaces(remote.faces);
    });
  }, [jobId]);

  function patchOptions(patch: Partial<AnalysisOptions>): AnalysisOptions {
    const next = { ...optionsRef.current, ...patch };
    optionsRef.current = next;
    setOptions(next);
    return next;
  }

  const handleModeChange = useCallback((mode: AnalysisMode) => {
    patchOptions({ mode });
  }, []);

  const handleFilterChange = useCallback(
    (
      key: "ignoreWhite" | "ignoreBlack" | "ignoreGrays" | "ignoreTransparentBackground",
      value: boolean,
    ) => {
      patchOptions({ [key]: value } as Partial<AnalysisOptions>);
    },
    [],
  );

  const handleIccProfileChange = useCallback((id: string) => {
    patchOptions({ iccProfileId: id });
  }, []);

  const handleCustomIccFile = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const signature =
        bytes.length > 40 ? String.fromCharCode(...bytes.slice(36, 40)) : "";
      if (signature !== "acsp") {
        throw new Error(
          "O arquivo enviado não é um perfil ICC válido. Verifique se o arquivo tem extensão .icc ou .icm.",
        );
      }

      let name = file.name;
      try {
        const icc = await import("@/lib/color/icc");
        const profileName = await icc.readProfileName(buffer);
        if (profileName) name = profileName;
      } catch {
        /* mantém o nome do arquivo */
      }

      customIccRef.current = { buffer, name };
      setCustomIcc({ buffer, name });
      patchOptions({ iccProfileId: "custom" });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Não foi possível ler o arquivo do perfil ICC.";
      window.alert(message);
    }
  }, []);

  const getCombinedData = useCallback(() => {
    return [frenteRef.current, versoRef.current]
      .map((face) => face?.getExportData())
      .filter((data): data is NonNullable<typeof data> => data != null);
  }, []);

  const persistCombinedData = useCallback(async () => {
    if (!jobId) return;
    const parts = getCombinedData();
    await Promise.all(
      parts.map((part) => saveRemoteFace(jobId, part.side, part.image, part.result)),
    );
  }, [getCombinedData, jobId]);

  const handleAddRecipientToVerso = useCallback(() => {
    const source = frenteRef.current?.getImage();
    const target = versoRef.current;
    if (!source || !target || target.getImage()) return;
    target.addBlankFromImage(source);
    target.setChip(mirrorChip(frenteRef.current?.getChip() ?? null));
  }, []);

  const handleAddRecipientToFrente = useCallback(() => {
    const source = versoRef.current?.getImage();
    const target = frenteRef.current;
    if (!source || !target || target.getImage()) return;
    target.addBlankFromImage(source);
    target.setChip(mirrorChip(versoRef.current?.getChip() ?? null));
  }, []);

  const handleDuplicateToVerso = useCallback(() => {
    const source = frenteRef.current?.getImage();
    const target = versoRef.current;
    if (!source || !target || target.getImage()) return;
    target.addImageFromImage(source);
    target.setChip(mirrorChip(frenteRef.current?.getChip() ?? null));
  }, []);

  const handleDuplicateToFrente = useCallback(() => {
    const source = versoRef.current?.getImage();
    const target = frenteRef.current;
    if (!source || !target || target.getImage()) return;
    target.addImageFromImage(source);
    target.setChip(mirrorChip(versoRef.current?.getChip() ?? null));
  }, []);

  const handleFrontChipChange = useCallback((position: ChipPosition | null) => {
    versoRef.current?.setChip(mirrorChip(position));
  }, []);

  const handleVersoChipChange = useCallback((position: ChipPosition | null) => {
    frenteRef.current?.setChip(mirrorChip(position));
  }, []);

  const handleFrontNewImage = useCallback((previousChip: ChipPosition | null) => {
    const otherChip = versoRef.current?.getChip() ?? null;
    frenteRef.current?.setChip(otherChip ? mirrorChip(otherChip) : previousChip);
  }, []);

  const handleVersoNewImage = useCallback((previousChip: ChipPosition | null) => {
    const otherChip = frenteRef.current?.getChip() ?? null;
    versoRef.current?.setChip(otherChip ? mirrorChip(otherChip) : previousChip);
  }, []);

  const checkFrenteOrientation = useCallback((width: number, height: number): string | null => {
    const versoImage = versoRef.current?.getImage();
    if (!versoImage) return null;
    const incoming = orientationOf(width, height);
    const other = orientationOf(versoImage.width, versoImage.height);
    if (
      (incoming === "vertical" && other === "horizontal") ||
      (incoming === "horizontal" && other === "vertical")
    ) {
      return `O verso já possui uma imagem ${other}. A frente deve ter a mesma orientação — carregue uma imagem ${other} nesta face.`;
    }
    return null;
  }, []);

  const checkVersoOrientation = useCallback((width: number, height: number): string | null => {
    const frenteImage = frenteRef.current?.getImage();
    if (!frenteImage) return null;
    const incoming = orientationOf(width, height);
    const other = orientationOf(frenteImage.width, frenteImage.height);
    if (
      (incoming === "vertical" && other === "horizontal") ||
      (incoming === "horizontal" && other === "vertical")
    ) {
      return `A frente já possui uma imagem ${other}. O verso deve ter a mesma orientação — carregue uma imagem ${other} nesta face.`;
    }
    return null;
  }, []);

  const handleFrenteImageStateChange = useCallback((hasImage: boolean) => {
    setFaceImages((current) =>
      current.frente === hasImage ? current : { ...current, frente: hasImage },
    );
  }, []);

  const handleVersoImageStateChange = useCallback((hasImage: boolean) => {
    setFaceImages((current) =>
      current.verso === hasImage ? current : { ...current, verso: hasImage },
    );
  }, []);

  const combinedFileName = useCallback((): string => {
    const parts = getCombinedData();
    return parts[0]?.result.imageName.replace(/\.[^.]+$/, "") || "analise";
  }, [getCombinedData]);

  const runCombined = useCallback(
    async (action: string, fn: () => void | Promise<void>) => {
      setCombinedBusy(true);
      try {
        await persistCombinedData();
        await fn();
      } finally {
        setCombinedBusy(false);
      }
    },
    [persistCombinedData],
  );

  const handleExportPng = useCallback(() => {
    const parts = getCombinedData();
    if (parts.length === 0) return;
    exportCombinedPalettePng(
      parts.map((part) => ({
        label: part.result.imageName,
        colors: part.result.colors,
      })),
      combinedFileName(),
    );
  }, [getCombinedData, combinedFileName]);

  const handleExportPdf = useCallback(() => {
    const parts = getCombinedData();
    if (parts.length === 0) return;
    return exportCombinedPdf(
      parts.map((part) => ({
        result: part.result,
        previewDataUrl: part.dataUrl,
      })),
      jobRef.current ?? undefined,
    );
  }, [getCombinedData]);

  const handleExportCsv = useCallback(() => {
    const parts = getCombinedData();
    if (parts.length === 0) return;
    exportCombinedCsv(
      parts.map((part, index) => ({
        face: index === 0 ? "Frente" : `Verso ${index}`,
        result: part.result,
      })),
      combinedFileName(),
      jobRef.current ?? undefined,
    );
  }, [getCombinedData, combinedFileName]);

  const handleExportJson = useCallback(() => {
    const parts = getCombinedData();
    if (parts.length === 0) return;
    exportCombinedJson(
      parts.map((part, index) => ({
        face: index === 0 ? "Frente" : `Verso ${index}`,
        result: part.result,
      })),
      combinedFileName(),
      jobRef.current ?? undefined,
    );
  }, [getCombinedData, combinedFileName]);

  const handlePreviewApproval = useCallback(() => {
    const parts = getCombinedData();
    if (parts.length === 0) return;
    saveApprovalPreview({
      pages: parts.map((part) => ({
        result: part.result,
        previewDataUrl: part.dataUrl,
      })),
      job: jobRef.current ?? undefined,
      jobId,
    });
    router.push("/preview");
  }, [getCombinedData, jobId, router]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Análise de cores</h1>
          <p className="mt-1 text-sm text-slate-500">Carregue e analise as imagens do pedido.</p>
        </div>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
          Voltar
        </button>
      </div>
      <div className="grid gap-6 lg:grid-cols-[330px_minmax(0,1fr)]">
        <aside>
          <OptionsPanel
            options={options}
            disabled={false}
            customIccName={customIcc?.name ?? null}
            onModeChange={handleModeChange}
            onFilterChange={handleFilterChange}
            onIccProfileChange={handleIccProfileChange}
            onCustomIccFile={handleCustomIccFile}
          />
        </aside>

        <section className="min-w-0 space-y-6">
          <FaceSection
            ref={frenteRef}
            side="frente"
            jobId={jobId}
            initialFace={savedFaces.find((face) => face.side === "frente") ?? null}
            title="Layout Frente"
            options={options}
            customIcc={customIcc}
            onAddRecipient={handleAddRecipientToVerso}
            onDuplicateImage={handleDuplicateToVerso}
            onImageStateChange={handleFrenteImageStateChange}
            onChipChange={handleFrontChipChange}
            onNewImage={handleFrontNewImage}
            getOrientationConflict={checkFrenteOrientation}
            showAddRecipient={!faceImages.verso}
          />
          <FaceSection
            ref={versoRef}
            side="verso"
            jobId={jobId}
            initialFace={savedFaces.find((face) => face.side === "verso") ?? null}
            title="Layout Verso"
            options={options}
            customIcc={customIcc}
            onAddRecipient={handleAddRecipientToFrente}
            onDuplicateImage={handleDuplicateToFrente}
            onImageStateChange={handleVersoImageStateChange}
            onChipChange={handleVersoChipChange}
            onNewImage={handleVersoNewImage}
            getOrientationConflict={checkVersoOrientation}
            showAddRecipient={!faceImages.frente}
          />

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <ExportBar
              onExportPng={() => void runCombined("png", handleExportPng)}
              onExportPdf={() => void runCombined("pdf", handleExportPdf)}
              onExportCsv={() => void runCombined("csv", handleExportCsv)}
              onExportJson={() => void runCombined("json", handleExportJson)}
              onExportApproval={() => void runCombined("approval", handlePreviewApproval)}
              onReset={() => {}}
              busy={combinedBusy}
            />
            <p className="mt-2 text-xs text-slate-400">
              Os exports geram Frente e Verso combinados. Cada face pode ser
              analisada, recolhida com conta-gotas e removida individualmente acima.
            </p>
            <div className="mt-3">
              <CmykNotice />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
