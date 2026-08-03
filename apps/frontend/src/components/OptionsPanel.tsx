"use client";

import { useRef } from "react";
import { ModeSelector } from "@/components/ModeSelector";
import { Toggle } from "@/components/Toggle";
import { ICC_PROFILES } from "@/lib/color/iccProfiles";
import type { AnalysisMode, AnalysisOptions } from "@/lib/types";

type FilterKey = "ignoreWhite" | "ignoreBlack" | "ignoreGrays" | "ignoreTransparentBackground";

interface OptionsPanelProps {
  options: AnalysisOptions;
  disabled: boolean;
  customIccName: string | null;
  onModeChange: (mode: AnalysisMode) => void;
  onFilterChange: (key: FilterKey, value: boolean) => void;
  onIccProfileChange: (id: string) => void;
  onCustomIccFile: (file: File) => void;
}

const FILTERS: Array<{
  key: FilterKey;
  label: string;
  description: string;
}> = [
  {
    key: "ignoreTransparentBackground",
    label: "Fundo transparente",
    description: "Desconsidera pixels translúcidos além dos totalmente transparentes.",
  },
  {
    key: "ignoreWhite",
    label: "Branco",
    description: "Desconsidera tons próximos do branco puro.",
  },
  {
    key: "ignoreBlack",
    label: "Preto",
    description: "Desconsidera tons próximos do preto puro.",
  },
  {
    key: "ignoreGrays",
    label: "Cinzas",
    description: "Desconsidera cores neutras e dessaturadas.",
  },
];

export function OptionsPanel({
  options,
  disabled,
  customIccName,
  onModeChange,
  onFilterChange,
  onIccProfileChange,
  onCustomIccFile,
}: OptionsPanelProps) {
  const iccInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h3 className="mb-3 text-sm font-semibold text-slate-800">Modo de análise</h3>
        <ModeSelector value={options.mode} onChange={onModeChange} />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Cores a ignorar</h3>
        <div className="divide-y divide-slate-100">
          {FILTERS.map((filter) => (
            <Toggle
              key={filter.key}
              label={filter.label}
              description={filter.description}
              checked={options[filter.key]}
              onChange={(value) => onFilterChange(filter.key, value)}
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-800">CMYK para impressão</h3>
        <p className="mb-3 text-xs leading-relaxed text-slate-400">
          Escolha o perfil ICC usado na conversão profissional para impressão.
        </p>
        <div className="space-y-1.5">
          {ICC_PROFILES.map((profile) => {
            const active = options.iccProfileId === profile.id;
            return (
              <label
                key={profile.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  active
                    ? "border-slate-800 bg-slate-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="icc-profile"
                  value={profile.id}
                  checked={active}
                  disabled={disabled}
                  onChange={() => onIccProfileChange(profile.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-slate-800"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">
                    {profile.label}
                  </span>
                  <span className="block text-xs leading-relaxed text-slate-400">
                    {profile.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {options.iccProfileId === "custom" && (
          <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <input
              ref={iccInputRef}
              type="file"
              accept=".icc,.icm,application/vnd.iccprofile"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onCustomIccFile(file);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => iccInputRef.current?.click()}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400"
            >
              {customIccName ? `Perfil: ${customIccName}` : "Enviar arquivo .icc ou .icm"}
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              O perfil personalizado é usado apenas localmente durante a sessão e nunca é
              enviado a servidores.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
