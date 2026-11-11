"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { dateBR, money, today, toNumber } from "@/lib/format";
import { CHECKLIST_ITEMS, EVENT_LABEL, EXPENSE_KIND, canStartTrip, realizedCost, tripResult } from "@/lib/fleet";
import type { Checklist, DeliveryProof, Driver, TripEvent, TripExpense, TripFull, VehicleFull } from "@/lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Stat, Textarea, linkBtnGhost } from "@/components/ui";
import { FileField, FileLink } from "@/components/FileField";

export default function ViagemDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { member } = useAppSession();
  const staff = isStaff(member?.role ?? null);
  const [trip, setTrip] = useState<TripFull | null>(null);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<VehicleFull[]>([]);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [check, setCheck] = useState<Checklist | null>(null);
  const [proof, setProof] = useState<DeliveryProof | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [ex, setEx] = useState({ kind: "pedagio", amount: "", description: "", receipt: null as string | null });

  const load = useCallback(async () => {
    const sb = getSupabase()!;
    const [t, d, v, e, ev, c, p] = await Promise.all([
      sb.from("trips").select("*, clients(name)").eq("id", id).maybeSingle(),
      sb.from("drivers").select("*").eq("active", true).order("name"),
      sb.from("vehicles").select("*").order("name"),
      sb.from("trip_expenses").select("*").eq("trip_id", id).order("date"),
      sb.from("trip_events").select("*").eq("trip_id", id).order("created_at", { ascending: false }),
      sb.from("vehicle_checklists").select("*").eq("trip_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("delivery_proofs").select("*").eq("trip_id", id).maybeSingle(),
    ]);
    if (t.error || !t.data) setErr("Viagem não encontrada ou sem permissão.");
    else {
      setTrip(t.data as TripFull); setDrivers((d.data ?? []) as Driver[]); setVehicles((v.data ?? []) as VehicleFull[]);
      setExpenses((e.data ?? []) as TripExpense[]); setEvents((ev.data ?? []) as TripEvent[]); setCheck((c.data ?? null) as Checklist | null); setProof((p.data ?? null) as DeliveryProof | null);
    }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function patch(values: Record<string, unknown>) {
    setErr(null);
    const { error } = await getSupabase()!.from("trips").update(values).eq("id", id);
    if (error) setErr(error.message);
    load();
  }

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const amount = toNumber(ex.amount);
    if (amount <= 0) return setErr("Informe um valor maior que zero.");
    const { error } = await getSupabase()!.from("trip_expenses").insert({
      trip_id: id, vehicle_id: trip!.vehicle_id, driver_id: trip!.driver_id, kind: ex.kind, amount, date: today(), description: ex.description.trim() || null, receipt_path: ex.receipt,
    });
    if (error) return setErr("Não foi possível lançar a despesa.");
    setEx({ kind: "pedagio", amount: "", description: "", receipt: null });
    load();
  }

  async function authorize() {
    if (!check) return;
    if (!note.trim()) return setErr("Informe o motivo da autorização.");
    setErr(null);
    const { error } = await getSupabase()!.from("vehicle_checklists").update({ authorized_at: new Date().toISOString(), authorization_note: note.trim() }).eq("id", check.id);
    if (error) setErr(error.message);
    setNote("");
    load();
  }

  if (loading) return <Loading />;
  if (!trip) return <ErrorBox message={err ?? "Erro"} />;

  const veh = vehicles.find((v) => v.id === trip.vehicle_id);
  const gate = canStartTrip({ driverId: trip.driver_id, vehicleId: trip.vehicle_id, vehicleStatus: veh?.status, checklist: check });
  const res = tripResult({ freight_value: Number(trip.freight_value), planned_cost: Number(trip.planned_cost), tax_value: Number(trip.tax_value) }, expenses);
  const real = realizedCost(expenses);
  const locked = trip.status === "entregue" || trip.status === "cancelada";

  return (
    <>
      <PageHeader crumb="Viagens" title={`${trip.origin} → ${trip.destination}`} subtitle={`${trip.clients?.name ?? "Sem cliente"} · ${trip.cargo ?? "carga não informada"}`} action={<Link href="/viagens" className={linkBtnGhost}>Voltar</Link>} />
      {err && <div className="mb-4"><ErrorBox message={err} /></div>}

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Frete" value={money(trip.freight_value)} />
        <Stat label={res.usingRealized ? "Custo realizado" : "Custo previsto"} value={money(res.cost)} note={res.usingRealized ? `Previsto: ${money(trip.planned_cost)} (${res.diff >= 0 ? "+" : ""}${money(res.diff)})` : "Sem despesas lançadas ainda"} />
        <Stat label="Imposto previsto" value={money(trip.tax_value)} />
        <Stat label="Resultado" value={money(res.result)} note={res.usingRealized ? `Previsto era ${money(res.plannedResult)}` : "Baseado no custo previsto"} />
      </div>

      <Card className="mb-6">
        <h2 className="text-lg font-extrabold text-pine-950">Programação</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="Motorista"><Select disabled={!staff || locked} value={trip.driver_id ?? ""} onChange={(e) => patch({ driver_id: e.target.value || null })}><option value="">Sem motorista</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Veículo"><Select disabled={!staff || locked} value={trip.vehicle_id ?? ""} onChange={(e) => patch({ vehicle_id: e.target.value || null })}><option value="">Sem veículo</option>{vehicles.filter((v) => v.status !== "inativo").map((v) => <option key={v.id} value={v.id}>{v.name} {v.plate ?? ""} · {v.status}</option>)}</Select></Field>
          <Field label="Instruções para o motorista"><Textarea disabled={!staff || locked} maxLength={1000} defaultValue={trip.instructions ?? ""} onBlur={(e) => e.target.value !== (trip.instructions ?? "") && patch({ instructions: e.target.value || null })} /></Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Badge tone={trip.status === "entregue" ? "good" : trip.status === "em_viagem" ? "warn" : trip.status === "cancelada" ? "bad" : "info"}>{trip.status}</Badge>
          {trip.status === "agendada" && !gate.ok && <span className="text-sm font-semibold text-warn">Para iniciar: {gate.reason}</span>}
          {staff && trip.status === "agendada" && <Button disabled={!gate.ok} onClick={() => patch({ status: "em_viagem" })}>Iniciar viagem</Button>}
          {staff && trip.status === "em_viagem" && <Button onClick={() => patch({ status: "entregue" })}>Marcar como entregue</Button>}
          {staff && !locked && <Button variant="danger" onClick={() => confirm("Cancelar esta viagem?") && patch({ status: "cancelada" })}>Cancelar viagem</Button>}
        </div>
      </Card>

      <Card className="mb-6">
        <h2 className="text-lg font-extrabold text-pine-950">Checklist do veículo</h2>
        {!check ? <p className="mt-2 text-sm text-muted">Ainda não preenchido. O motorista preenche no portal dele; a viagem só inicia depois disso.</p> : (
          <>
            <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
              {CHECKLIST_ITEMS.map((i) => { const v = check.items[i.key]; return <li key={i.key}>{i.label}: <Badge tone={v === "ok" ? "good" : v === "atencao" ? "warn" : v === "critico" ? "bad" : "neutral"}>{v === "ok" ? "OK" : v === "atencao" ? "Atenção" : v === "critico" ? "Crítico" : "—"}</Badge></li>; })}
            </ul>
            {check.notes && <p className="mt-2 text-sm">Observações: {check.notes}</p>}
            {check.has_critical && (check.authorized_at ? <p className="mt-3 text-sm font-semibold text-green-800">Pendência crítica autorizada pela gestão em {dateBR(check.authorized_at)}: {check.authorization_note}</p> : (
              <div className="mt-3 rounded-xl border border-danger/30 bg-red-50 p-4">
                <p className="font-semibold text-danger">Pendência crítica: a viagem está bloqueada.</p>
                {staff && <div className="mt-2 flex flex-wrap items-end gap-2"><div className="min-w-60 flex-1"><Field label="Motivo da autorização"><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} /></Field></div><Button onClick={authorize}>Autorizar mesmo assim</Button></div>}
              </div>
            ))}
          </>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="text-lg font-extrabold text-pine-950">Despesas da viagem</h2>
        {expenses.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhuma despesa lançada.</p> : (
          <ul className="mt-3 divide-y divide-line">
            {expenses.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <p className="text-sm"><b>{EXPENSE_KIND[x.kind] ?? x.kind}</b> · {dateBR(x.date)} {x.description && `· ${x.description}`} {x.fuel_log_id && <Badge tone="info">do abastecimento</Badge>} {x.receipt_path && <FileLink path={x.receipt_path}>Comprovante</FileLink>}</p>
                <p className="tnum font-bold">{money(x.amount)} {staff && !x.fuel_log_id && <button type="button" className="ml-2 text-xs text-danger underline" onClick={async () => { await getSupabase()!.from("trip_expenses").delete().eq("id", x.id); load(); }}>excluir</button>}</p>
              </li>
            ))}
            <li className="flex justify-between py-2.5 font-extrabold"><span>Total realizado</span><span className="tnum">{money(real.total)}</span></li>
          </ul>
        )}
        {staff && member && !locked && (
          <form onSubmit={addExpense} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
            <Field label="Tipo"><Select value={ex.kind} onChange={(e) => setEx({ ...ex, kind: e.target.value })}>{Object.entries(EXPENSE_KIND).filter(([k]) => k !== "combustivel").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Valor (R$)"><Input required inputMode="decimal" value={ex.amount} onChange={(e) => setEx({ ...ex, amount: e.target.value })} /></Field>
            <Field label="Descrição"><Input maxLength={200} value={ex.description} onChange={(e) => setEx({ ...ex, description: e.target.value })} /></Field>
            <div className="self-end"><FileField label="Comprovante" orgId={member.orgId} folder="despesas" value={ex.receipt} onChange={(p) => setEx({ ...ex, receipt: p })} /></div>
            <div className="sm:col-span-4"><Button type="submit">Lançar despesa</Button> <span className="text-xs text-muted">Combustível entra pela tela de Abastecimento, ligado a esta viagem.</span></div>
          </form>
        )}
      </Card>

      {proof && (
        <Card className="mb-6">
          <h2 className="text-lg font-extrabold text-pine-950">Comprovante de entrega</h2>
          <p className="mt-2 text-sm">Recebido por <b>{proof.received_by}</b> em {dateBR(proof.confirmed_at)}. {proof.notes}</p>
          <p className="mt-1 flex flex-wrap gap-3 text-sm">{proof.signature_path && <FileLink path={proof.signature_path}>Ver assinatura (captura em tela)</FileLink>}{(proof.photo_paths ?? []).map((p, i) => <FileLink key={p} path={p}>Foto {i + 1}</FileLink>)}</p>
          <p className="mt-2 text-xs text-muted">A entrega não altera o status de pagamento. O recebimento continua sendo confirmado manualmente em Viagens e recebimentos.</p>
        </Card>
      )}

      <Card>
        <h2 className="text-lg font-extrabold text-pine-950">Linha do tempo</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {events.map((e) => <li key={e.id}><span className="tnum text-muted">{new Date(e.created_at).toLocaleString("pt-BR")}</span> · <b>{EVENT_LABEL[e.kind] ?? e.kind}</b>{e.note ? `: ${e.note}` : ""}</li>)}
        </ul>
      </Card>
    </>
  );
}
