"use client";

interface ToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-4 py-2 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-700">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">
            {description}
          </span>
        ) : null}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
          checked ? "bg-slate-800" : "bg-slate-200 group-hover:bg-slate-300"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
