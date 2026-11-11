"use client";
import { useState } from "react";
import { useTable } from "@/lib/useTable";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { tollSummary } from "@/lib/compliance";
import { dateBR, money, today, toNumber } from "@/lib/format";
import { Notice, Table, Td } from "@/components/extra";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, Stat, Textarea } from "@/components/ui";
import type { Trip } from "@/lib/types";

type Toll = { id: string; trip_id: string | null; origin: string | null; destination: string | null; route: string | null; vehicle_type: string | null; axles: number | null; category: string | null; plazas: string | null; reference_date: string; total_value: number; kind: "estimado" | "confirmado"; paid_by: "transportadora" | "contratante_vale_pedagio"; notes: string | null };

export default function PedagiosPage() {
  const { member } = useAppSession();
  const staff = isStaff(member?.role ?? null);
  const tolls = useTable<Toll>("toll_records");
  const trips = useTable<Trip>("trips");
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ trip_id: "", origin: "", destination: "", route: "", vehicle_type: "", axles: "", category: "", plazas: "", reference_date: today(), total_value: "", kind: "estimado", paid_by: "transportadora", notes: "" });
  const [err, setErr] = useState<string | null>(null);
  const s = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  const sum = tollSummary(tolls.rows);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const t = trips.rows.find((x) => x.id === v.trip_id);
    const { error } = await getSupabase()!.from("toll_records").insert({ ...v, trip_id: v.trip_id || null, origin: v.origin || t?.origin || null, destination: v.destination || t?.destination || null, axles: v.axles ? Number(v.axles) : null, total_value: toNumber(v.total_value) });
    if (error) return setErr("Não foi possível salvar. Confira os campos.");
    setOpen(false); tolls.reload();
  }
  async function confirmToll(t: Toll) {
    const { error } = await getSupabase()!.from("toll_records").update({ kind: "confirmado" }).eq("id", t.id);
    if (!error) tolls.reload();
  }

  return (
    <>
      <PageHeader crumb="Fiscal" title="Pedágios e vale-pedágio" subtitle="Estimativa, valor confirmado, vale-pedágio do contratante e custo real da transportadora."
        action={staff && !open && <Button onClick={() => setOpen(true)}>Novo pedágio</Button>} />
      <Notice>Tarifas e rotas são <b>cadastradas por você</b>; o sistema não inventa valores. Só entra no custo realizado da viagem o pedágio <b>confirmado e pago pela transportadora</b>: o vale-pedágio fornecido pelo contratante não é contado duas vezes. A integração com serviço de roteirização/tarifas ainda não está configurada.</Notice>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Estimado" value={money(sum.estimated)} /><Stat label="Confirmado" value={money(sum.confirmed)} />
        <Stat label="Vale-pedágio do contratante" value={money(sum.valePedagio)} note="Não é custo da transportadora" /><Stat label="Custo suportado pela transportadora" value={money(sum.borne)} note="Confirmado e pago por ela" />
      </div>
      {open && staff && (
        <Card className="mb-6"><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2">Novo registro de pedágio</h2>
          <Field label="Viagem"><Select value={v.trip_id} onChange={s("trip_id")}><option value="">Sem viagem (referência de rota)</option>{trips.rows.map((t) => <option key={t.id} value={t.id}>{t.origin} → {t.destination}</option>)}</Select></Field>
          <Field label="Rota"><Input value={v.route} onChange={s("route")} /></Field>
          <Field label="Origem"><Input value={v.origin} onChange={s("origin")} /></Field><Field label="Destino"><Input value={v.destination} onChange={s("destination")} /></Field>
          <Field label="Tipo de veículo"><Input value={v.vehicle_type} onChange={s("vehicle_type")} /></Field><Field label="Eixos"><Input type="number" min={1} max={12} value={v.axles} onChange={s("axles")} /></Field>
          <Field label="Categoria tarifária"><Input value={v.category} onChange={s("category")} /></Field><Field label="Praças de pedágio"><Input value={v.plazas} onChange={s("plazas")} /></Field>
          <Field label="Data de referência"><Input type="date" value={v.reference_date} onChange={s("reference_date")} /></Field><Field label="Valor total (R$)"><Input required inputMode="decimal" value={v.total_value} onChange={s("total_value")} /></Field>
          <Field label="Tipo"><Select value={v.kind} onChange={s("kind")}><option value="estimado">Estimado</option><option value="confirmado">Confirmado</option></Select></Field>
          <Field label="Quem paga"><Select value={v.paid_by} onChange={s("paid_by")}><option value="transportadora">Transportadora</option><option value="contratante_vale_pedagio">Contratante (vale-pedágio)</option></Select></Field>
          <div className="sm:col-span-2"><Field label="Observações"><Textarea value={v.notes} onChange={s("notes")} /></Field></div>
          {err && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2">{err}</p>}
          <div className="flex gap-3 sm:col-span-2"><Button type="submit">Salvar</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button></div></form></Card>
      )}
      {tolls.loading ? <Loading /> : tolls.error ? <ErrorBox message={tolls.error} onRetry={tolls.reload} /> : tolls.rows.length === 0 ? <Empty title="Nenhum pedágio" text="Cadastre pedágios estimados ou confirmados." /> : (
        <Table head={["Data", "Rota / viagem", "Veículo", "Valor", "Tipo", "Quem paga", ""]}>
          {tolls.rows.map((t) => (
            <tr key={t.id}><Td>{dateBR(t.reference_date)}</Td><Td>{t.route || `${t.origin ?? "—"} → ${t.destination ?? "—"}`}<p className="text-xs text-muted">{t.plazas}</p></Td>
              <Td>{t.vehicle_type ?? "—"}{t.axles ? ` · ${t.axles} eixos` : ""}</Td><Td className="tnum">{money(t.total_value)}</Td>
              <Td><Badge tone={t.kind === "confirmado" ? "good" : "neutral"}>{t.kind === "confirmado" ? "Confirmado" : "Estimado"}</Badge></Td>
              <Td>{t.paid_by === "transportadora" ? "Transportadora" : "Contratante (vale-pedágio)"}</Td>
              <Td>{staff && t.kind === "estimado" && <Button variant="ghost" onClick={() => confirmToll(t)}>Confirmar</Button>}</Td></tr>
          ))}
        </Table>
      )}
    </>
  );
}
