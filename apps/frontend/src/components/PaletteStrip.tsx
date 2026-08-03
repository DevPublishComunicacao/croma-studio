"use client";

import { useState } from "react";
import { formatPercentage } from "@/lib/color/analysis";
import type { Cmyk } from "@/lib/types";
import type { DominantColor } from "@/lib/types";

interface PaletteStripProps {
  colors: DominantColor[];
  onRemove: (index: number) => void;
  onNameChange: (index: number, name: string) => void;
}

function cmykLines(cmyk: Cmyk): [string, string] {
  const { c, m, y, k } = cmyk;
  return [`C: ${c}%  M: ${m}%`, `Y: ${y}%  K: ${k}%`];
}

export function PaletteStrip({ colors, onRemove, onNameChange }: PaletteStripProps) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  if (colors.length === 0) return null;

  async function copyHex(color: DominantColor, index: number) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(color.hex);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = color.hex;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex(null), 1300);
    } catch {
      setCopiedIndex(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {colors.map((color, index) => {
        const hasName = Boolean(color.name && color.name.trim());
        const isEditing = editingIndex === index;

        return (
          <div
            key={`${color.hex}-${index}`}
            className="group relative w-[7rem] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-transform hover:-translate-y-0.5"
          >
            <button
              type="button"
              title={`${color.hex} · ${color.manual ? "Manual" : formatPercentage(color.percentage)}`}
              aria-label={`Copiar ${color.hex}`}
              onClick={() => copyHex(color, index)}
              className="w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span
                className="flex h-9 w-full items-center justify-center font-mono text-[10px] font-bold transition-colors"
                style={{ backgroundColor: color.hex }}
              >
                <span className="text-white/0 drop-shadow-sm transition-colors group-hover:text-white/90">
                  {copiedIndex === index ? "OK!" : color.hex}
                </span>
              </span>
            </button>

            {isEditing ? (
              <input
                autoFocus
                type="text"
                defaultValue={color.name ?? ""}
                maxLength={40}
                placeholder="Nome da cor"
                onFocus={(e) => e.target.select()}
                onBlur={(e) => {
                  onNameChange(index, e.target.value);
                  setEditingIndex(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onClick={(e) => e.stopPropagation()}
                className="m-1 block w-[calc(100%-8px)] rounded-md border border-blue-400 bg-white px-1 py-0.5 text-center font-mono text-[9px] font-semibold leading-tight text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
            ) : (
              <button
                type="button"
                title="Clique para dar um nome à cor"
                onClick={() => setEditingIndex(index)}
                className="block w-full px-1 py-1 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {hasName ? (
                  <span className="line-clamp-2 font-mono text-[9px] font-bold uppercase leading-tight text-slate-700">
                    {color.name}
                  </span>
                ) : color.cmykPrint ? (
                  <span className="flex flex-col gap-0.5 font-mono text-[9px] font-semibold leading-tight text-slate-700">
                    <span>{cmykLines(color.cmykPrint)[0]}</span>
                    <span>{cmykLines(color.cmykPrint)[1]}</span>
                  </span>
                ) : (
                  <span className="font-mono text-[9px] font-semibold leading-tight text-slate-700">
                    {color.hex}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => onRemove(index)}
              aria-label={`Remover ${color.hex} da paleta`}
              title="Remover da paleta"
              className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-md bg-white/90 text-slate-500 opacity-0 shadow-sm transition-opacity hover:bg-red-500 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 group-hover:opacity-100"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-3 w-3"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}
