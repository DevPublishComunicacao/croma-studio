"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { clearJobData, clearJobId } from "@/lib/job/storage";
import { useGlobalLoading } from "@/components/GlobalLoadingProvider";

function BrandMark() {
  return (
    <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center">
      <span className="absolute left-1 top-1 h-4 w-4 rounded-[5px] bg-cyan-500" />
      <span className="absolute right-1 top-1 h-4 w-4 rounded-[5px] bg-magenta-500" />
      <span className="absolute bottom-1 left-1 h-4 w-4 rounded-[5px] bg-yellow-500" />
      <span className="absolute bottom-1 right-1 h-4 w-4 rounded-[5px] bg-slate-900" />
    </span>
  );
}

export function HeaderNav() {
  const router = useRouter();
  const { startLoading } = useGlobalLoading();
  const [open, setOpen] = useState(false);

  function handleNewLayout() {
    startLoading("Iniciando novo layout...");
    clearJobData();
    clearJobId();
    setOpen(false);
    router.push("/");
  }

  return (
    <header className="border-b border-white/10 bg-slate-900 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3" aria-label="Croma Studio - início">
          <BrandMark />
          <span>
            <span className="block text-base font-bold tracking-tight">Croma Studio</span>
            <span className="block text-xs text-slate-400">Análise de Cores Gráficas</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-expanded={open}
              aria-haspopup="menu"
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              LAYOUTS
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 7.5l5 5 5-5" />
              </svg>
            </button>
            {open && (
              <div className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-700 shadow-xl" role="menu">
                <button
                  type="button"
                  onClick={handleNewLayout}
                  className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors hover:bg-slate-100"
                  role="menuitem"
                >
                  Novo Layout
                  <span className="mt-0.5 block text-xs font-normal text-slate-400">Começar com formulário vazio</span>
                </button>
                <Link
                  href="/layouts"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors hover:bg-slate-100"
                  role="menuitem"
                >
                  Layouts Existentes
                  <span className="mt-0.5 block text-xs font-normal text-slate-400">Consultar pedidos salvos</span>
                </Link>
              </div>
            )}
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-slate-300 sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            Processamento 100% local
          </span>
        </div>
      </div>
    </header>
  );
}
