"use client";
import Link from "next/link";
import { useTable } from "@/lib/useTable";
import { dateBR, money, today } from "@/lib/format";
import type { Order, Quote, Trip } from "@/lib/types";
import { Empty, ErrorBox, Loading, PageHeader, Stat, linkBtn } from "@/components/ui";

export default function DashboardPage() {
  const quotes = useTable<Quote>("quotes", { select: "*, clients(name)" });
  const trips = useTable<Trip>("trips");
  const orders = useTable<Order>("orders");

  const loading = quotes.loading || trips.loading || orders.loading;
  const error = quotes.error || trips.error || orders.error;
  const reload = () => {
    quotes.reload();
    trips.reload();
    orders.reload();
  };

  const month = today().slice(0, 7);
  const open = quotes.rows.filter((q) => q.status === "rascunho" || q.status === "enviada");
  const followUps = open.filter((q) => q.follow_up_date && q.follow_up_date <= today());
  const approvedMonth = quotes.rows.filter((q) => q.status === "aprovada" && q.created_at.slice(0, 7) === month);
  const pendingPay = trips.rows.filter((t) => t.payment_status === "pendente" && t.status !== "cancelada");
  const overdue = pendingPay.filter((t) => t.payment_due && t.payment_due < today());
  const newOrders = orders.rows.filter((o) => o.status === "novo");
  const empty = !quotes.rows.length && !trips.rows.length && !orders.rows.length;

  return (
    <>
      <PageHeader crumb="Dashboard" title="Dashboard executivo" subtitle="Acompanhe os resultados e a operação da transportadora." />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : empty ? (
        <Empty
          title="Comece pela primeira cotação"
          text="Cadastre um veículo e um cliente, faça uma cotação e os números do seu mês aparecem aqui."
          action={<Link href="/cotacoes/nova" className={linkBtn}>Fazer cotação</Link>}
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Pedidos novos" value={String(newOrders.length)} note="Aguardando cotação" />
            <Stat label="Cotações em aberto" value={String(open.length)} note={`${money(open.reduce((s, q) => s + q.freight_value, 0))} em propostas`} />
            <Stat
              label="Fretes aprovados no mês"
              value={money(approvedMonth.reduce((s, q) => s + q.freight_value, 0))}
              note={`Sobra estimada ${money(approvedMonth.reduce((s, q) => s + q.profit, 0))}`}
            />
            <Stat
              label="A receber"
              value={money(pendingPay.reduce((s, t) => s + t.freight_value, 0))}
              note={overdue.length ? `${overdue.length} vencido(s)` : "Nada vencido"}
            />
          </div>

          <section className="mt-8">
            <h2 className="text-lg font-extrabold text-pine-950">Para retornar hoje</h2>
            {followUps.length === 0 ? (
              <p className="mt-2 text-muted">Nenhuma cotação com retorno marcado para hoje ou antes.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {followUps.map((q) => (
                  <li key={q.id}>
                    <Link href={`/cotacoes/${q.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white p-4 hover:border-pine-700">
                      <span className="font-semibold">{q.origin} → {q.destination} · {q.clients?.name ?? "Sem cliente"}</span>
                      <span className="text-sm text-muted">retorno {dateBR(q.follow_up_date)} · {money(q.freight_value)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
