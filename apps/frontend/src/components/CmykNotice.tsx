"use client";

import { CMYK_DISCLAIMER } from "@/lib/color/analysis";

export function CmykNotice() {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
        />
      </svg>
      <p className="text-[13px] leading-relaxed text-amber-800">{CMYK_DISCLAIMER}</p>
    </div>
  );
}
