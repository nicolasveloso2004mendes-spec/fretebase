"use client";
import { useState } from "react";
import { rpc } from "@/lib/db";
import { fetchAll } from "@/lib/db";
import { useQuery } from "@/lib/useQuery";
import { dateBR, toNumber } from "@/lib/format";
import { Table, Td } from "@/components/extra";
import { Badge, Button, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";

type O = { id: string; origin: string; destination: string; cargo: string | null; desired_date: string | null; status: string; created_at: string };
const blank = { origin: "", destination: "", cargo: "", weight: "", cargo_value: "", dimensions: "", date: "", notes: "" };

export default function PortalCotacaoPage() {
  const [v, setV] = useState(blank);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useQuery(() => fetchAll<O>("client_orders", "*", "created_at"));
  const s = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      await rpc("client_request_quote", { p_origin: v.origin, p_destination: v.destination, p_cargo: v.cargo || null, p_weight: v.weight ? toNumber(v.weight) : null, p_cargo_value: v.cargo_value ? toNumber(v.cargo_value) : null, p_dimensions: v.dimensions || null, p_date: v.date || null, p_notes: v.notes || null });
      setMsg({ ok: true, t: "Solicitação enviada. A transportadora vai analisar e responder com uma proposta." });
      setV(blank); list.reload();
    } catch (x) { setMsg({ ok: false, t: (x as Error).message }); }
    setBusy(false);
  }
  return (
    <>
      <PageHeader crumb="Portal do cliente" title="Solicitar cotação" subtitle="Informe os dados da carga. A proposta chega em “Propostas”." />
      <Card className="mb-8"><form onSubmit={send} className="grid gap-4 sm:grid-cols-2">
        <Field label="Origem"><Input required maxLength={200} value={v.origin} onChange={s("origin")} /></Field><Field label="Destino"><Input required maxLength={200} value={v.destination} onChange={s("destination")} /></Field>
        <Field label="Tipo de mercadoria"><Input maxLength={300} value={v.cargo} onChange={s("cargo")} /></Field><Field label="Peso (kg)"><Input inputMode="decimal" value={v.weight} onChange={s("weight")} /></Field>
        <Field label="Valor declarado (R$)"><Input inputMode="decimal" value={v.cargo_value} onChange={s("cargo_value")} /></Field><Field label="Dimensões"><Input maxLength={200} value={v.dimensions} onChange={s("dimensions")} /></Field>
        <Field label="Data desejada"><Input type="date" value={v.date} onChange={s("date")} /></Field>
        <div className="sm:col-span-2"><Field label="Observações"><Textarea maxLength={1000} value={v.notes} onChange={s("notes")} /></Field></div>
        {msg && <p role="status" className={`text-sm font-semibold sm:col-span-2 ${msg.ok ? "text-green-800" : "text-danger"}`}>{msg.t}</p>}
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Enviando…" : "Enviar solicitação"}</Button></div></form></Card>
      <h2 className="mb-3 text-lg font-extrabold text-pine-950">Minhas solicitações</h2>
      {list.data && list.data.length > 0 ? <Table head={["Data", "Rota", "Carga", "Situação"]}>{list.data.map((o) => <tr key={o.id}><Td>{dateBR(o.created_at)}</Td><Td>{o.origin} → {o.destination}</Td><Td>{o.cargo ?? "—"}</Td><Td><Badge tone={o.status === "cotado" ? "good" : "neutral"}>{o.status === "novo" ? "Em análise" : o.status === "cotado" ? "Cotada" : "Cancelada"}</Badge></Td></tr>)}</Table> : <p className="text-muted">Nenhuma solicitação ainda.</p>}
    </>
  );
}
