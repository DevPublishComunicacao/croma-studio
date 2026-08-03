"use client";

import type { AnalysisMode } from "@/lib/types";

const MODES: Array<{
  value: AnalysisMode;
  label: string;
  hint: string;
}> = [
  {
    value: "predominantes",
    label: "Predominantes",
    hint: "Pela área ocupada na imagem",
  },
  {
    value: "destaque",
    label: "Destaque",
    hint: "Por saturação, contraste e relevância visual",
  },
];

interface ModeSelectorProps {
  value: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
}

export function ModeSelector({ value, onChange }: ModeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
      {MODES.map((mode) => {
        const active = mode.value === value;
        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            aria-pressed={active}
            className={`rounded-lg px-3 py-2 text-left transition-all ${
              active
                ? "bg-white shadow-sm ring-1 ring-slate-200"
                : "hover:bg-slate-200/60"
            }`}
          >
            <span
              className={`block text-sm font-semibold ${
                active ? "text-slate-900" : "text-slate-500"
              }`}
            >
              {mode.label}
            </span>
            <span
              className={`block text-[11px] leading-snug ${
                active ? "text-slate-400" : "text-slate-400/80"
              }`}
            >
              {mode.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}
