"use client";
import Link from "next/link";
import { useTable } from "@/lib/useTable";
import { dateBR, money } from "@/lib/format";
import type { Quote, QuoteStatus } from "@/lib/types";
import { Badge, Empty, ErrorBox, Loading, PageHeader, linkBtn } from "@/components/ui";

const statusTone: Record<QuoteStatus, "neutral" | "info" | "good" | "bad"> = {
  rascunho: "neutral",
  enviada: "info",
  aprovada: "good",
  recusada: "bad",
};
const statusLabel: Record<QuoteStatus, string> = {
  rascunho: "Rascunho",
  enviada: "Enviada",
  aprovada: "Aprovada",
  recusada: "Recusada",
};

export default function CotacoesPage() {
  const { rows, loading, error, reload } = useTable<Quote>("quotes", { select: "*, clients(name)" });

  return (
    <>
      <PageHeader
        crumb="Cotações"
        title="Cotações"
        subtitle="Acompanhe propostas e datas de retorno."
        action={<Link href="/cotacoes/nova" className={linkBtn}>Nova cotação</Link>}
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : rows.length === 0 ? (
        <Empty
          title="Nenhuma cotação ainda"
          text="Faça a primeira cotação para ver quanto sobra no frete antes de enviar a proposta."
          action={<Link href="/cotacoes/nova" className={linkBtn}>Fazer cotação</Link>}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((q) => (
            <li key={q.id}>
              <Link
                href={`/cotacoes/${q.id}`}
                className="grid gap-3 rounded-2xl border border-line bg-white p-5 transition-colors hover:border-pine-700 sm:grid-cols-[1fr_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold text-pine-950">
                    {q.origin} → {q.destination}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {q.clients?.name ?? "Sem cliente"} · {dateBR(q.created_at)}
                    {q.follow_up_date && ` · retorno em ${dateBR(q.follow_up_date)}`}
                  </p>
                </div>
                <div className="flex items-center gap-4 sm:text-right">
                  <div>
                    <p className="tnum font-extrabold text-pine-950">{money(q.freight_value)}</p>
                    <p className={`tnum text-xs font-semibold ${q.profit < 0 ? "text-danger" : "text-muted"}`}>sobra {money(q.profit)}</p>
                  </div>
                  <Badge tone={statusTone[q.status]}>{statusLabel[q.status]}</Badge>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
