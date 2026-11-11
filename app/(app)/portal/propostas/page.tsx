"use client";
import { useState } from "react";
import { fetchAll, rpc } from "@/lib/db";
import { useQuery } from "@/lib/useQuery";
import { dateBR, money, today } from "@/lib/format";
import { Badge, Button, Card, Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";

type Q = { id: string; origin: string; destination: string; cargo: string | null; freight_value: number; terms: string | null; valid_until: string | null; status: string; created_at: string };
const ST: Record<string, { l: string; t: "info" | "good" | "bad" }> = { enviada: { l: "Aguardando sua resposta", t: "info" }, aprovada: { l: "Aprovada", t: "good" }, recusada: { l: "Recusada", t: "bad" } };

export default function PortalPropostasPage() {
  const q = useQuery(() => fetchAll<Q>("client_quotes", "*", "created_at"));
  const [err, setErr] = useState<string | null>(null);
  async function answer(id: string, accept: boolean) {
    setErr(null);
    try { await rpc("client_answer_quote", { p_quote: id, p_accept: accept }); q.reload(); } catch (x) { setErr((x as Error).message); }
  }
  return (
    <>
      <PageHeader crumb="Portal do cliente" title="Propostas" subtitle="Propostas enviadas pela transportadora." />
      {err && <p role="alert" className="mb-4 text-sm font-semibold text-danger">{err}</p>}
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : !q.data?.length ? <Empty title="Nenhuma proposta" text="Quando a transportadora enviar uma proposta, ela aparece aqui." /> : (
        <ul className="space-y-4">{q.data.map((p) => { const expired = !!p.valid_until && p.valid_until < today(); return (
          <li key={p.id}><Card><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-extrabold text-pine-950">{p.origin} → {p.destination}</h2><Badge tone={ST[p.status].t}>{expired && p.status === "enviada" ? "Vencida" : ST[p.status].l}</Badge></div>
            <p className="mt-1 text-sm text-muted">{p.cargo ?? "Carga"} · enviada em {dateBR(p.created_at)}{p.valid_until ? ` · válida até ${dateBR(p.valid_until)}` : ""}</p>
            <p className="tnum mt-3 text-2xl font-extrabold">{money(p.freight_value)}</p>{p.terms && <p className="mt-1 text-sm">{p.terms}</p>}
            {p.status === "enviada" && !expired && <div className="mt-4 flex gap-3"><Button onClick={() => answer(p.id, true)}>Aprovar proposta</Button><Button variant="danger" onClick={() => answer(p.id, false)}>Recusar</Button></div>}
          </Card></li>); })}</ul>
      )}
    </>
  );
}
