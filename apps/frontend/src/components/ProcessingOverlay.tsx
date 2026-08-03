"use client";

interface ProcessingOverlayProps {
  title: string;
  step?: string;
}

export function ProcessingOverlay({ title, step }: ProcessingOverlayProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/85 backdrop-blur-sm">
      <div className="flex max-w-sm flex-col items-center gap-4 px-6 text-center">
        <span className="relative flex h-14 w-14 items-center justify-center">
          <span className="absolute h-14 w-14 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-6 w-6 text-blue-600" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42"
            />
          </svg>
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-slate-800">{title}</p>
          {step ? <p className="text-xs text-slate-400">{step}</p> : null}
        </div>
      </div>
    </div>
  );
}
