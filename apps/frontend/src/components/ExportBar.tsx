"use client";

import { useState } from "react";

interface ExportBarProps {
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onExportApproval: () => void;
  onReset: () => void;
  busy: boolean;
}

interface ActionButtonProps {
  onClick: () => void;
  busy: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}

function ActionButton({ onClick, busy, icon, children }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {icon}
      {children}
    </button>
  );
}

const icons = {
  png: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l-4.5-4.5M12 19.5l4.5-4.5" transform="rotate(90 12 12)" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 8.25v-3A2.25 2.25 0 016.75 3h10.5A2.25 2.25 0 0119.5 5.25v3M4.5 15.75v3A2.25 2.25 0 006.75 21h10.5a2.25 2.25 0 002.25-2.25v-3" />
    </svg>
  ),
  pdf: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  csv: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  ),
  json: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-3.5 w-3.5" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
  ),
};

export function ExportBar({
  onExportPng,
  onExportPdf,
  onExportCsv,
  onExportJson,
  onExportApproval,
  onReset,
  busy,
}: ExportBarProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  async function run(action: string, fn: () => void | Promise<void>) {
    setExporting(action);
    try {
      await fn();
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold text-slate-500">Exportar:</span>
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ActionButton
          busy={busy || exporting !== null}
          icon={icons.png}
          onClick={() => run("png", onExportPng)}
        >
          {exporting === "png" ? "Gerando…" : "Paleta PNG"}
        </ActionButton>
        <ActionButton
          busy={busy || exporting !== null}
          icon={icons.pdf}
          onClick={() => run("pdf", onExportPdf)}
        >
          {exporting === "pdf" ? "Gerando…" : "PDF"}
        </ActionButton>
        <ActionButton
          busy={busy || exporting !== null}
          icon={icons.csv}
          onClick={() => run("csv", onExportCsv)}
        >
          {exporting === "csv" ? "Gerando…" : "CSV"}
        </ActionButton>
        <ActionButton
          busy={busy || exporting !== null}
          icon={icons.json}
          onClick={() => run("json", onExportJson)}
        >
          {exporting === "json" ? "Gerando…" : "JSON"}
        </ActionButton>
        <button
          type="button"
          disabled={busy || exporting !== null}
          onClick={() => run("approval", onExportApproval)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {exporting === "approval" ? "Gerando…" : "GERAL LAYOUT DE APROVAÇÃO"}
        </button>
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
            />
          </svg>
          Analisar outra imagem
        </button>
      </div>
    </div>
  );
}
