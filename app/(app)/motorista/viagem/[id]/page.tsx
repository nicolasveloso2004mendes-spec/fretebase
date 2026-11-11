"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { dateBR, money, today, toNumber } from "@/lib/format";
import { CHECKLIST_ITEMS, EVENT_LABEL, EXPENSE_KIND, hasCritical } from "@/lib/fleet";
import { uploadFile } from "@/lib/storage";
import type { Checklist, DriverTrip, TripEvent, TripExpense } from "@/lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea, linkBtnGhost } from "@/components/ui";
import { FileField } from "@/components/FileField";
import { SignaturePad } from "@/components/SignaturePad";

export default function ViagemMotorista() {
  const { id } = useParams<{ id: string }>();
  const { member } = useAppSession();
  const [trip, setTrip] = useState<DriverTrip | null>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [check, setCheck] = useState<Checklist | null>(null);
  const [expenses, setExpenses] = useState<TripExpense[]>([]);
  const [events, setEvents] = useState<TripEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [items, setItems] = useState<Record<string, string>>(Object.fromEntries(CHECKLIST_ITEMS.map((i) => [i.key, "ok"])));
  const [cNotes, setCNotes] = useState("");
  const [cPhoto, setCPhoto] = useState<string | null>(null);
  const [ex, setEx] = useState({ kind: "pedagio", amount: "", description: "", receipt: null as string | null });
  const [fu, setFu] = useState({ odometer: "", liters: "", price: "", location: "", full: true, receipt: null as string | null });
  const [evt, setEvt] = useState({ kind: "ocorrencia", note: "" });
  const [del, setDel] = useState<{ by: string; notes: string; photos: string[]; sig: Blob | null }>({ by: "", notes: "", photos: [], sig: null });

  const load = useCallback(async () => {
    const sb = getSupabase()!;
    const [t, d, c, e, ev] = await Promise.all([
      sb.from("driver_trips").select("*").eq("id", id).maybeSingle(),
      sb.from("drivers").select("id").maybeSingle(),
      sb.from("vehicle_checklists").select("*").eq("trip_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      sb.from("trip_expenses").select("*").eq("trip_id", id).order("created_at", { ascending: false }),
      sb.from("trip_events").select("*").eq("trip_id", id).order("created_at", { ascending: false }),
    ]);
    if (t.error || !t.data) setErr("Viagem não encontrada.");
    else { setTrip(t.data as DriverTrip); setDriverId(d.data?.id ?? null); setCheck((c.data ?? null) as Checklist | null); setExpenses((e.data ?? []) as TripExpense[]); setEvents((ev.data ?? []) as TripEvent[]); }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>, after?: () => void) {
    setBusy(true); setErr(null);
    const { error } = await fn();
    if (error) setErr(error.message);
    else after?.();
    await load();
    setBusy(false);
  }
  const rpc = (name: string, args: Record<string, unknown>) => getSupabase()!.rpc(name, args);

  if (loading) return <Loading />;
  if (!trip || !member) return <ErrorBox message={err ?? "Erro"} />;
  const open = trip.status === "agendada" || trip.status === "em_viagem";

  return (
    <>
      <PageHeader crumb="Motorista" title={`${trip.origin} → ${trip.destination}`} subtitle={`${trip.cargo ?? "Carga não informada"} · ${trip.vehicle_name ?? "sem veículo"} ${trip.vehicle_plate ?? ""}`} action={<Link href="/motorista" className={linkBtnGhost}>Voltar</Link>} />
      {err && <div className="mb-4"><ErrorBox message={err} /></div>}
      <p className="mb-4"><Badge tone={trip.status === "em_viagem" ? "warn" : trip.status === "entregue" ? "good" : "info"}>{trip.status}</Badge> {trip.instructions && <span className="ml-2 text-sm">Instruções: {trip.instructions}</span>}</p>

      {trip.status === "agendada" && (
        <Card className="mb-6">
          <h2 className="text-lg font-extrabold text-pine-950">1. Checklist do veículo</h2>
          {check ? (
            <p className="mt-2 text-sm">Checklist enviado. {check.has_critical && !check.authorized_at ? <b className="text-danger">Há pendência crítica: aguarde a autorização da gestão para iniciar.</b> : "Você pode iniciar a viagem."}</p>
          ) : !trip.vehicle_id || !driverId ? <p className="mt-2 text-sm text-warn">Aguardando a transportadora definir o veículo.</p> : (
            <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => getSupabase()!.from("vehicle_checklists").insert({ trip_id: id, vehicle_id: trip.vehicle_id, driver_id: driverId, items, notes: cNotes.trim() || null, photo_paths: cPhoto ? [cPhoto] : [] })); }}>
              {CHECKLIST_ITEMS.map((i) => (
                <div key={i.key} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold">{i.label}</span>
                  <Select aria-label={i.label} className="!mt-0 max-w-40" value={items[i.key]} onChange={(e) => setItems({ ...items, [i.key]: e.target.value })}><option value="ok">OK</option><option value="atencao">Atenção</option><option value="critico">Crítico</option></Select>
                </div>
              ))}
              {hasCritical(items) && <p className="text-sm font-semibold text-danger">Item crítico marcado: a viagem só inicia após autorização da gestão.</p>}
              <Field label="Observações"><Textarea maxLength={500} value={cNotes} onChange={(e) => setCNotes(e.target.value)} /></Field>
              <FileField label="Foto (opcional)" camera orgId={member.orgId} folder="checklist" value={cPhoto} onChange={setCPhoto} />
              <Button type="submit" disabled={busy}>Enviar checklist</Button>
            </form>
          )}
          <h2 className="mt-6 text-lg font-extrabold text-pine-950">2. Coleta e saída</h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button variant="ghost" disabled={busy || !!trip.picked_up_at} onClick={() => run(() => rpc("driver_confirm_pickup", { p_trip: id }))}>{trip.picked_up_at ? "Coleta confirmada" : "Confirmar coleta"}</Button>
            <Button disabled={busy || !check} onClick={() => run(() => rpc("driver_start_trip", { p_trip: id }))}>Iniciar viagem</Button>
          </div>
        </Card>
      )}

      {open && (
        <>
          <Card className="mb-6">
            <h2 className="text-lg font-extrabold text-pine-950">Registrar parada, atraso ou ocorrência</h2>
            <form className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); run(() => rpc("driver_add_event", { p_trip: id, p_kind: evt.kind, p_note: evt.note }), () => setEvt({ kind: "ocorrencia", note: "" })); }}>
              <Field label="Tipo"><Select value={evt.kind} onChange={(e) => setEvt({ ...evt, kind: e.target.value })}><option value="parada">Parada</option><option value="atraso">Atraso</option><option value="ocorrencia">Ocorrência</option></Select></Field>
              <div className="sm:col-span-2"><Field label="Descrição"><Input required maxLength={1000} value={evt.note} onChange={(e) => setEvt({ ...evt, note: e.target.value })} /></Field></div>
              <div className="sm:col-span-3"><Button type="submit" disabled={busy}>Registrar</Button></div>
            </form>
          </Card>

          <Card className="mb-6">
            <h2 className="text-lg font-extrabold text-pine-950">Lançar gasto</h2>
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
              e.preventDefault();
              const amount = toNumber(ex.amount);
              if (amount <= 0) return setErr("Informe um valor maior que zero.");
              run(() => getSupabase()!.from("trip_expenses").insert({ trip_id: id, vehicle_id: trip.vehicle_id, driver_id: driverId, kind: ex.kind, amount, date: today(), description: ex.description.trim() || null, receipt_path: ex.receipt }), () => setEx({ kind: "pedagio", amount: "", description: "", receipt: null }));
            }}>
              <Field label="Tipo"><Select value={ex.kind} onChange={(e) => setEx({ ...ex, kind: e.target.value })}>{Object.entries(EXPENSE_KIND).filter(([k]) => k !== "combustivel").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
              <Field label="Valor (R$)"><Input required inputMode="decimal" value={ex.amount} onChange={(e) => setEx({ ...ex, amount: e.target.value })} /></Field>
              <Field label="Descrição"><Input maxLength={200} value={ex.description} onChange={(e) => setEx({ ...ex, description: e.target.value })} /></Field>
              <FileField label="Foto do comprovante" camera orgId={member.orgId} folder="despesas" value={ex.receipt} onChange={(p) => setEx({ ...ex, receipt: p })} />
              <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Lançar gasto</Button></div>
            </form>
          </Card>

          <Card className="mb-6">
            <h2 className="text-lg font-extrabold text-pine-950">Registrar abastecimento</h2>
            <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => {
              e.preventDefault();
              const liters = toNumber(fu.liters), price = toNumber(fu.price);
              if (!trip.vehicle_id) return setErr("Esta viagem ainda não tem veículo.");
              if (liters <= 0 || price <= 0) return setErr("Informe litros e preço maiores que zero.");
              run(() => getSupabase()!.from("fuel_logs").insert({ vehicle_id: trip.vehicle_id, driver_id: driverId, trip_id: id, date: today(), location: fu.location.trim() || null, odometer_km: toNumber(fu.odometer), liters, price_per_liter: price, total_value: Math.round(liters * price * 100) / 100, full_tank: fu.full, receipt_path: fu.receipt }), () => setFu({ odometer: "", liters: "", price: "", location: "", full: true, receipt: null }));
            }}>
              <Field label="Hodômetro (km)"><Input required inputMode="decimal" value={fu.odometer} onChange={(e) => setFu({ ...fu, odometer: e.target.value })} /></Field>
              <Field label="Posto"><Input maxLength={120} value={fu.location} onChange={(e) => setFu({ ...fu, location: e.target.value })} /></Field>
              <Field label="Litros"><Input required inputMode="decimal" value={fu.liters} onChange={(e) => setFu({ ...fu, liters: e.target.value })} /></Field>
              <Field label="Preço por litro (R$)"><Input required inputMode="decimal" value={fu.price} onChange={(e) => setFu({ ...fu, price: e.target.value })} /></Field>
              <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" className="size-5" checked={fu.full} onChange={(e) => setFu({ ...fu, full: e.target.checked })} />Tanque cheio</label>
              <FileField label="Foto do comprovante" camera orgId={member.orgId} folder="abastecimento" value={fu.receipt} onChange={(p) => setFu({ ...fu, receipt: p })} />
              <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Registrar abastecimento</Button></div>
            </form>
          </Card>
        </>
      )}

      {trip.status === "em_viagem" && (
        <Card className="mb-6">
          <h2 className="text-lg font-extrabold text-pine-950">Confirmar entrega</h2>
          <form className="mt-3 space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true); setErr(null);
            try {
              const sigPath = del.sig ? await uploadFile(member.orgId, "assinaturas", del.sig as Blob & { type: string; size: number }) : null;
              const { error } = await rpc("driver_deliver", { p_trip: id, p_received_by: del.by, p_notes: del.notes, p_photos: del.photos, p_signature: sigPath });
              if (error) setErr(error.message);
            } catch (x) { setErr((x as Error).message); }
            await load(); setBusy(false);
          }}>
            <Field label="Quem recebeu a carga"><Input required maxLength={160} value={del.by} onChange={(e) => setDel({ ...del, by: e.target.value })} /></Field>
            <Field label="Observações"><Textarea maxLength={500} value={del.notes} onChange={(e) => setDel({ ...del, notes: e.target.value })} /></Field>
            <FileField label="Foto do canhoto / da carga entregue" camera orgId={member.orgId} folder="entregas" value={del.photos[0] ?? null} onChange={(p) => setDel({ ...del, photos: p ? [p] : [] })} />
            <SignaturePad onChange={(b) => setDel({ ...del, sig: b })} />
            <Button type="submit" disabled={busy}>{busy ? "Enviando…" : "Confirmar entrega"}</Button>
            <p className="text-xs text-muted">A confirmação de entrega não significa pagamento recebido.</p>
          </form>
        </Card>
      )}

      {expenses.length > 0 && <Card className="mb-6"><h2 className="text-lg font-extrabold text-pine-950">Gastos lançados</h2><ul className="mt-2 text-sm">{expenses.map((x) => <li key={x.id} className="flex justify-between py-1"><span>{EXPENSE_KIND[x.kind]} · {dateBR(x.date)} {x.description}</span><b className="tnum">{money(x.amount)}</b></li>)}</ul></Card>}
      <Card><h2 className="text-lg font-extrabold text-pine-950">Histórico</h2><ul className="mt-2 space-y-1.5 text-sm">{events.map((e) => <li key={e.id}><span className="text-muted">{new Date(e.created_at).toLocaleString("pt-BR")}</span> · <b>{EVENT_LABEL[e.kind] ?? e.kind}</b>{e.note ? `: ${e.note}` : ""}</li>)}</ul></Card>
    </>
  );
}
