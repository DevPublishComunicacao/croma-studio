"use client";

import { useRef, useState } from "react";

interface UploadZoneProps {
  onFile: (file: File) => void;
  busy: boolean;
}

const ACCEPT = ".jpg,.jpeg,.png,.webp,.tif,.tiff,image/jpeg,image/png,image/webp,image/tiff,image/x-tiff";

export function UploadZone({ onFile, busy }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file && !busy) onFile(file);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Enviar imagem para análise"
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !busy) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`group flex cursor-pointer flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-all ${
        busy
          ? "cursor-not-allowed border-slate-200 bg-slate-50"
          : dragging
            ? "border-blue-500 bg-blue-50/60"
            : "border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      <span
        className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-colors ${
          dragging ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600"
        }`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-8 w-8" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
      </span>

      <span className="space-y-1">
        <span className="block text-base font-semibold text-slate-800">
          Arraste sua arte gráfica ou clique para escolher
        </span>
        <span className="block text-sm text-slate-400">
          A imagem é processada localmente no seu navegador — nada é enviado ou armazenado em servidores.
        </span>
      </span>

      <span className="flex flex-wrap items-center justify-center gap-2">
        {["JPG", "JPEG", "PNG", "WEBP", "TIFF"].map((format) => (
          <span
            key={format}
            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold tracking-wide text-slate-500"
          >
            {format}
          </span>
        ))}
      </span>
    </div>
  );
}
