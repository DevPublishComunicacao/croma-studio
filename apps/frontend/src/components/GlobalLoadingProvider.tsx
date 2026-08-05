"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

interface LoadingContextValue {
  startLoading: (message?: string) => void;
  stopLoading: () => void;
}

const LoadingContext = createContext<LoadingContextValue | null>(null);

export function useGlobalLoading(): LoadingContextValue {
  const context = useContext(LoadingContext);
  if (!context) throw new Error("useGlobalLoading deve ser usado dentro de GlobalLoadingProvider.");
  return context;
}

export function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Carregando...");

  const value = useMemo(
    () => ({
      startLoading(nextMessage = "Carregando...") {
        setMessage(nextMessage);
        setLoading(true);
      },
      stopLoading() {
        setLoading(false);
      },
    }),
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target as HTMLElement | null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("http") || link.target === "_blank") return;
      const url = new URL(href, window.location.href);
      if (url.pathname !== window.location.pathname) {
        value.startLoading("Abrindo página...");
      }
    }

    document.addEventListener("click", handleDocumentClick, true);
    return () => document.removeEventListener("click", handleDocumentClick, true);
  }, [value]);

  return (
    <LoadingContext.Provider value={value}>
      {children}
      {loading && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-label={message}
        >
          <div className="w-full max-w-xs rounded-2xl border border-white/20 bg-white/95 p-6 text-center shadow-2xl">
            <div className="mx-auto h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-full w-2/5 animate-[loading-bar_1.2s_ease-in-out_infinite] rounded-full bg-orange-500" />
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-800">{message}</p>
            <p className="mt-1 text-xs text-slate-400">Aguarde, por favor.</p>
          </div>
        </div>
      )}
    </LoadingContext.Provider>
  );
}
