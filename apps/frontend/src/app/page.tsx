"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useGlobalLoading } from "@/components/GlobalLoadingProvider";

import { createRemoteJob, updateRemoteJob } from "@/lib/api/client";
import { EMPTY_JOB, loadJobData, loadJobId, saveJobData, saveJobId } from "@/lib/job/storage";
import type { JobData } from "@/lib/types";

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        required={required}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-b border-slate-200 pb-2 text-sm font-bold uppercase tracking-widest text-slate-500">
      {children}
    </h2>
  );
}

export default function Home() {
  const router = useRouter();
  const { startLoading } = useGlobalLoading();
  const [job, setJob] = useState<JobData>(EMPTY_JOB);

  useEffect(() => {
    const savedJob = loadJobData();
    if (savedJob) setJob(savedJob);
  }, []);

  function patch(patch: Partial<JobData>) {
    setJob((prev) => ({ ...prev, ...patch }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startLoading("Salvando dados do pedido...");
    saveJobData(job);
    const existingJobId = loadJobId();
    let remoteJobId: string | null;
    if (existingJobId) {
      await updateRemoteJob(existingJobId, job);
      remoteJobId = existingJobId;
    } else {
      remoteJobId = await createRemoteJob(job);
    }
    if (remoteJobId) saveJobId(remoteJobId);
    router.push("/analise");
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Dados do pedido
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Informe os dados do cliente e da arte para gerar o layout de aprovação.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle>Cliente</SectionTitle>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field
              label="Número do pedido:"
              value={job.numeroPedido}
              onChange={(v) => patch({ numeroPedido: v.replace(/\D/g, "") })}
              placeholder="Número do pedido"
              inputMode="numeric"
            />
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Sistema:</span>
              <select
                value={job.sistema}
                onChange={(e) => patch({ sistema: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Selecione…</option>
                <option value="CONTATO IMPRESSO">CONTATO IMPRESSO</option>
                <option value="GRÁFICA CONTATO IMPRESSO">GRÁFICA CONTATO IMPRESSO</option>
                <option value="CAPTAÇÃO DE PEDIDO">CAPTAÇÃO DE PEDIDO</option>
                <option value="MERCOS">MERCOS</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">Vendedor:</span>
              <select
                value={job.vendedor}
                onChange={(e) => patch({ vendedor: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Selecione…</option>
                <option value="ERIC">ERIC</option>
                <option value="LEIA">LEIA</option>
                <option value="LUIZ CHIRO">LUIZ CHIRO</option>
                <option value="SID">SID</option>
                <option value="VALDIRENE">VALDIRENE</option>
                <option value="ADRIANE">ADRIANE</option>
                <option value="MARCIA">MARCIA</option>
                <option value="ANTONIO">ANTONIO</option>
                <option value="CRISTIANO">CRISTIANO</option>
              </select>
            </label>
          </div>
          <div className="mt-4 grid gap-4">
            <Field
              label="Cliente:"
              value={job.cliente}
              onChange={(v) => patch({ cliente: v })}
              placeholder="Nome do cliente"
              required
            />
            <Field
              label="Produto:"
              value={job.produto}
              onChange={(v) => patch({ produto: v })}
              placeholder="Ex.: Cartão de fidelidade"
              required
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle>Arte / Produto</SectionTitle>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Material:"
              value={job.material}
              onChange={(v) => patch({ material: v })}
              placeholder="Ex.: PVC"
            />
            <Field
              label="Tamanho:"
              value={job.tamanho}
              onChange={(v) => patch({ tamanho: v })}
              placeholder="Ex.: 85,5 × 54 mm"
            />
            <Field
              label="Espessura:"
              value={job.espessura}
              onChange={(v) => patch({ espessura: v })}
              placeholder="Ex.: 0,76 mm"
            />
            <Field
              label="Cores:"
              value={job.cores}
              onChange={(v) => patch({ cores: v })}
              placeholder="Ex.: 4/0 (4x0), 4/4"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle>Tecnologia</SectionTitle>

          <div className="mt-4 space-y-5">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Tarja magnética</p>
                  <p className="text-xs text-slate-500">Possui tarja magnética no produto?</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => patch({ tarjaMagnetica: true })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      job.tarjaMagnetica
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ tarjaMagnetica: false, tipoTarja: "" })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      !job.tarjaMagnetica
                        ? "bg-slate-800 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Não
                  </button>
                </div>
              </div>
              {job.tarjaMagnetica && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">
                      Tipo de tarja:
                    </span>
                    <select
                      value={job.tipoTarja}
                      onChange={(e) => patch({ tipoTarja: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Selecione…</option>
                      <option value="alta">Alta</option>
                      <option value="baixa">Baixa</option>
                    </select>
                  </label>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Chip RFID</p>
                  <p className="text-xs text-slate-500">Possui chip RFID embutido?</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => patch({ chipRfid: true })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      job.chipRfid
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ chipRfid: false, tipoChip: "" })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      !job.chipRfid
                        ? "bg-slate-800 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Não
                  </button>
                </div>
              </div>
              {job.chipRfid && (
                <div className="mt-3">
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold text-slate-700">
                      Tipo de chip:
                    </span>
                    <select
                      value={job.tipoChip}
                      onChange={(e) => patch({ tipoChip: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="">Selecione…</option>
                      <option value="1K 13,56 MHz">1K 13,56 MHz</option>
                      <option value="2K 7 bytes">2K 7 bytes</option>
                      <option value="MIFARE PLUS 1K/4K">MIFARE PLUS 1K/4K</option>
                      <option value="MINI 1K">MINI 1K</option>
                      <option value="125 KHz">125 KHz</option>
                    </select>
                  </label>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">Infrared</p>
                  <p className="text-xs text-slate-500">Possui tecnologia infrared?</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => patch({ infrared: true })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      job.infrared
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Sim
                  </button>
                  <button
                    type="button"
                    onClick={() => patch({ infrared: false, infraredCor: "" })}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                      !job.infrared
                        ? "bg-slate-800 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Não
                  </button>
                </div>
              </div>
              {job.infrared && (
                <div className="mt-3">
                  <Field
                    label="Cor:"
                    value={job.infraredCor}
                    onChange={(v) => patch({ infraredCor: v })}
                    placeholder="Ex.: Vermelho"
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SectionTitle>Finalização</SectionTitle>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field
              label="Acabamento:"
              value={job.acabamento}
              onChange={(v) => patch({ acabamento: v })}
              placeholder="Ex.: Fosco, verniz localizado"
            />
            <label className="block">
              <span className="mb-1 block text-sm font-semibold text-slate-700">
                Observações:
              </span>
              <textarea
                value={job.observacoes}
                onChange={(e) => patch({ observacoes: e.target.value })}
                rows={3}
                placeholder="Observações adicionais…"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
          >
            Continuar para análise
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12l-7.5 7.5M21 12H3" />
            </svg>
          </button>
        </div>
      </form>
    </main>
  );
}
