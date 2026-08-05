"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useGlobalLoading } from "@/components/GlobalLoadingProvider";
import { deleteRemoteJob, getRemoteJob, listRemoteJobs, type RemoteJobSummary } from "@/lib/api/client";
import { clearApprovalPreview } from "@/lib/export/approvalPreviewStorage";
import { clearJobData, clearJobId, saveJobData, saveJobId } from "@/lib/job/storage";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function LayoutsPage() {
  const router = useRouter();
  const { startLoading, stopLoading } = useGlobalLoading();
  const [items, setItems] = useState<RemoteJobSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function handleNewLayout() {
    startLoading("Iniciando novo layout...");
    void clearApprovalPreview();
    clearJobData();
    clearJobId();
    router.push("/");
  }

  async function handleOpenLayout(id: string) {
    startLoading("Carregando layout...");
    setOpeningId(id);
    setError(null);
    const result = await getRemoteJob(id);
    if (!result) {
      setError("Não foi possível abrir este layout. Verifique se a API está ativa.");
      setOpeningId(null);
      stopLoading();
      return;
    }
    void clearApprovalPreview();
    saveJobData(result.job);
    saveJobId(result.job.id);
    router.push("/");
  }

  async function handleDeleteLayout(id: string) {
    if (!window.confirm("Excluir este layout e todos os dados da análise?")) return;
    setDeletingId(id);
    startLoading("Excluindo layout...");
    setError(null);
    const deleted = await deleteRemoteJob(id);
    if (deleted) {
      setItems((current) => current.filter((item) => item.id !== id));
    } else {
      setError("Não foi possível excluir este layout. Verifique se a API está ativa.");
    }
    setDeletingId(null);
    stopLoading();
  }

  useEffect(() => {
    void loadPage();
  }, []);

  async function loadPage(cursor?: string | null) {
    setError(null);
    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    const result = await listRemoteJobs(cursor);
    if (!result) {
      setError("Não foi possível carregar os layouts. Verifique se o PostgreSQL e a API estão ativos.");
    } else {
      setItems((current) => (cursor ? [...current, ...result.items] : result.items));
      setNextCursor(result.nextCursor);
    }
    setLoading(false);
    setLoadingMore(false);
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-8 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600">Gestão de layouts</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Layouts Existentes</h1>
          <p className="mt-1 text-sm text-slate-500">Pedidos e análises registrados no PostgreSQL.</p>
        </div>
        <button
          type="button"
          onClick={handleNewLayout}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          Novo Layout
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-500">Carregando layouts…</div>
        ) : error ? (
          <div className="p-10 text-center text-sm text-rose-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-slate-700">Nenhum layout cadastrado.</p>
            <p className="mt-1 text-sm text-slate-400">Crie um novo layout para ele aparecer nesta tabela.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-3 font-bold">Número do pedido</th>
                    <th className="px-5 py-3 font-bold">Cliente</th>
                    <th className="px-5 py-3 font-bold">Produto</th>
                    <th className="px-5 py-3 font-bold">Sistema</th>
                    <th className="px-5 py-3 font-bold">Vendedor</th>
                    <th className="px-5 py-3 font-bold">Criado em</th>
                    <th className="px-5 py-3 text-right font-bold">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => void handleOpenLayout(item.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void handleOpenLayout(item.id);
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label={`Abrir layout ${item.numeroPedido || item.cliente || item.id}`}
                      className={`cursor-pointer transition-colors hover:bg-blue-50 focus:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400 ${openingId === item.id ? "bg-blue-50 opacity-60" : ""}`}
                    >
                      <td className="px-5 py-4 font-semibold text-slate-800">{item.numeroPedido || "NÃO"}</td>
                      <td className="px-5 py-4 text-slate-700">{item.cliente || "NÃO"}</td>
                      <td className="px-5 py-4 text-slate-700">{item.produto || "NÃO"}</td>
                      <td className="px-5 py-4 text-slate-600">{item.sistema || "NÃO"}</td>
                      <td className="px-5 py-4 text-slate-600">{item.vendedor || "NÃO"}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-slate-500">{formatDate(item.createdAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteLayout(item.id);
                          }}
                          disabled={deletingId === item.id}
                          aria-label={`Excluir layout ${item.numeroPedido || item.cliente || item.id}`}
                          title="Excluir layout"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-wait disabled:opacity-50"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {nextCursor && (
              <div className="flex justify-center border-t border-slate-100 p-4">
                <button
                  type="button"
                  onClick={() => void loadPage(nextCursor)}
                  disabled={loadingMore}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  {loadingMore ? "Carregando…" : "Carregar mais"}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
