"use client";

import { CopyButton } from "@/components/CopyButton";
import { formatPercentage } from "@/lib/color/analysis";
import { formatCmyk } from "@/lib/color/cmykApprox";
import type { DominantColor } from "@/lib/types";

interface ColorCardProps {
  color: DominantColor;
  iccProfileLabel: string;
  iccLoading: boolean;
  iccError: boolean;
  nativeCmyk: boolean;
  onNameChange: (name: string) => void;
  onRemove: () => void;
}

function textOnColor(hex: string): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 150 ? "#0f172a" : "#ffffff";
}

export function ColorCard({
  color,
  iccProfileLabel,
  iccLoading,
  iccError,
  nativeCmyk,
  onNameChange,
  onRemove,
}: ColorCardProps) {
  const onColor = textOnColor(color.hex);

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative flex h-40 items-end p-4" style={{ backgroundColor: color.hex }}>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remover ${color.hex} da paleta`}
          title="Remover da paleta"
          className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
            />
          </svg>
        </button>
        <div className="flex items-end justify-between gap-2">
          <div>
            <span
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold"
              style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "#0f172a" }}
            >
              {color.manual ? "Conta-gotas" : `Cor ${color.rank}`}
            </span>
            <p
              className="mt-2 font-mono text-2xl font-bold tracking-tight drop-shadow-sm"
              style={{ color: onColor }}
            >
              {color.hex}
            </p>
          </div>
          <p
            className="shrink-0 rounded-lg px-2 py-1 text-sm font-bold"
            style={{ backgroundColor: "rgba(255,255,255,0.92)", color: "#0f172a" }}
          >
            {color.manual ? "Manual" : formatPercentage(color.percentage)}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <dl className="divide-y divide-slate-100">
          <div className="flex items-center gap-2 py-1.5">
            <dt className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
              RGB
            </dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-700">
              {color.rgb.r}, {color.rgb.g}, {color.rgb.b}
            </dd>
            <CopyButton text={`${color.rgb.r}, ${color.rgb.g}, ${color.rgb.b}`} label="RGB" />
          </div>

          <div className="flex items-center gap-2 py-1.5">
            <dt className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-400">
              CMYK
            </dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-[13px] text-slate-700">
              {color.cmykPrint ? (
                formatCmyk(color.cmykPrint)
              ) : iccLoading ? (
                <span className="inline-flex items-center gap-1.5 text-slate-400">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                  Calculando…
                </span>
              ) : iccError ? (
                <span className="text-red-500">Falha ao aplicar perfil</span>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </dd>
            {color.cmykPrint ? (
              <CopyButton text={formatCmyk(color.cmykPrint, "; ")} label="CMYK" />
            ) : null}
          </div>
        </dl>

        <p className="truncate text-[11px] text-slate-400" title={iccProfileLabel}>
          Impressão ·{" "}
          {nativeCmyk ? (
            <span className="font-semibold text-blue-600">CMYK nativo do arquivo</span>
          ) : (
            iccProfileLabel
          )}
        </p>

        <label className="mt-auto block">
          <span className="sr-only">Nome da cor</span>
          <input
            type="text"
            value={color.name}
            maxLength={40}
            placeholder="Nome da cor (opcional)"
            onChange={(e) => onNameChange(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:outline-none"
          />
        </label>
      </div>
    </article>
  );
}
