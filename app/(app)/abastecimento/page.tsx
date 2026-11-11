"use client";
import { useMemo, useState } from "react";
import { useTable } from "@/lib/useTable";
import { useAppSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { dateBR, km, money, today, toNumber } from "@/lib/format";
import { averageConsumption, consumptionAlert, consumptionSegments } from "@/lib/fleet";
import type { Driver, FuelLogRow, VehicleFull } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select } from "@/components/ui";
import { FileField, FileLink } from "@/components/FileField";

type TripOpt = { id: string; origin: string; destination: string; status: string };
const blank = { vehicle_id: "", driver_id: "", trip_id: "", date: today(), location: "", odometer_km: "", liters: "", price: "", fuel_type: "diesel", full_tank: true, receipt: null as string | null };

export default function AbastecimentoPage() {
  const { member } = useAppSession();
  const canEdit = isStaff(member?.role ?? null);
  const fuel = useTable<FuelLogRow>("fuel_logs", { select: "*, vehicles(name, plate)", order: "date" });
  const vs = useTable<VehicleFull>("vehicles", { order: "name" });
  const ds = useTable<Driver>("drivers", { order: "name" });
  const trips = useTable<TripOpt>("trips", { select: "id, origin, destination, status" });
  const [form, setForm] = useState(blank);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const total = toNumber(form.liters) * toNumber(form.price);
  const openTrips = trips.rows.filter((t) => t.status !== "cancelada");

  const perVehicle = useMemo(() => {
    return vs.rows.map((v) => {
      const logs = fuel.rows.filter((f) => f.vehicle_id === v.id).map((f) => ({ id: f.id, vehicle_id: f.vehicle_id, date: f.date, odometer_km: Number(f.odometer_km), liters: Number(f.liters), full_tank: f.full_tank }));
      const segs = consumptionSegments(logs);
      return { v, avg: averageConsumption(segs), n: segs.length };
    }).filter((x) => x.n > 0);
  }, [vs.rows, fuel.rows]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!member) return;
    setBusy(true);
    setErr(null);
    const liters = toNumber(form.liters), price = toNumber(form.price);
    if (liters <= 0 || price <= 0) { setErr("Informe litros e preço por litro maiores que zero."); setBusy(false); return; }
    try {
      await fuel.insert({
        vehicle_id: form.vehicle_id, driver_id: form.driver_id || null, trip_id: form.trip_id || null, date: form.date, location: form.location.trim() || null,
        odometer_km: toNumber(form.odometer_km), liters, price_per_liter: price, total_value: Math.round(liters * price * 100) / 100,
        fuel_type: form.fuel_type, full_tank: form.full_tank, receipt_path: form.receipt,
      });
      setForm(blank); setOpen(false); vs.reload();
    } catch (x) {
      setErr(`Não foi possível salvar: ${(x as Error).message}`);
    }
    setBusy(false);
  }

  return (
    <>
      <PageHeader crumb="Abastecimento" title="Abastecimento e consumo"
        subtitle="Cada abastecimento ligado a uma viagem vira uma despesa da viagem automaticamente (sem lançar duas vezes). O consumo real sai do método do tanque cheio."
        action={canEdit && !open && <Button onClick={() => { setForm({ ...blank, vehicle_id: vs.rows[0]?.id ?? "" }); setOpen(true); }} disabled={vs.rows.length === 0}>Novo abastecimento</Button>} />

      {perVehicle.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {perVehicle.map(({ v, avg, n }) => (
            <div key={v.id} className="rounded-2xl border border-line bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{v.name}</p>
              <p className="tnum mt-2 text-2xl font-extrabold text-pine-950">{avg!.toFixed(2).replace(".", ",")} km/l</p>
              <p className="mt-1 text-xs text-muted">Referência {v.consumption_km_l} km/l · {n} trecho(s)</p>
              {consumptionAlert(avg, v.consumption_km_l) && <div className="mt-2"><Badge tone="warn">Consumo bem abaixo do cadastrado</Badge></div>}
            </div>
          ))}
        </div>
      )}

      {open && member && (
        <Card className="mb-6">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2 lg:col-span-3">Novo abastecimento</h2>
            <Field label="Veículo"><Select required value={form.vehicle_id} onChange={set("vehicle_id")}>{vs.rows.map((v) => <option key={v.id} value={v.id}>{v.name} {v.plate ?? ""}</option>)}</Select></Field>
            <Field label="Motorista"><Select value={form.driver_id} onChange={set("driver_id")}><option value="">Não informado</option>{ds.rows.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
            <Field label="Viagem (opcional)" hint="Se escolher, vira despesa da viagem."><Select value={form.trip_id} onChange={set("trip_id")}><option value="">Sem viagem</option>{openTrips.map((t) => <option key={t.id} value={t.id}>{t.origin} → {t.destination}</option>)}</Select></Field>
            <Field label="Data"><Input type="date" required value={form.date} onChange={set("date")} /></Field>
            <Field label="Posto / local"><Input maxLength={120} value={form.location} onChange={set("location")} /></Field>
            <Field label="Hodômetro (km)"><Input required inputMode="decimal" value={form.odometer_km} onChange={set("odometer_km")} /></Field>
            <Field label="Litros"><Input required inputMode="decimal" value={form.liters} onChange={set("liters")} /></Field>
            <Field label="Preço por litro (R$)"><Input required inputMode="decimal" value={form.price} onChange={set("price")} /></Field>
            <Field label="Total (calculado)"><Input readOnly value={money(total)} /></Field>
            <Field label="Combustível"><Select value={form.fuel_type} onChange={set("fuel_type")}><option value="diesel">Diesel</option><option value="diesel_s10">Diesel S10</option><option value="gasolina">Gasolina</option><option value="etanol">Etanol</option><option value="gnv">GNV</option></Select></Field>
            <label className="flex min-h-11 items-center gap-2 self-end text-sm font-semibold text-pine-900"><input type="checkbox" className="size-5" checked={form.full_tank} onChange={(e) => setForm({ ...form, full_tank: e.target.checked })} />Tanque cheio</label>
            <FileField label="Comprovante" orgId={member.orgId} folder="abastecimento" value={form.receipt} onChange={(p) => setForm({ ...form, receipt: p })} camera />
            {err && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2 lg:col-span-3">{err}</p>}
            <div className="flex gap-3 sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar abastecimento"}</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button></div>
          </form>
        </Card>
      )}

      {fuel.loading ? <Loading /> : fuel.error ? <ErrorBox message={fuel.error} onRetry={fuel.reload} /> : fuel.rows.length === 0 ? (
        <Empty title="Nenhum abastecimento" text="Lance o primeiro abastecimento para começar a medir o consumo real." />
      ) : (
        <ul className="space-y-3">
          {fuel.rows.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-line bg-white p-5">
              <div>
                <p className="font-bold text-pine-950">{f.vehicles?.name} {f.vehicles?.plate && `(${f.vehicles.plate})`} {f.full_tank && <Badge tone="info">Tanque cheio</Badge>} {f.trip_id && <Badge tone="good">Na viagem</Badge>}</p>
                <p className="tnum mt-1 text-sm text-muted">{dateBR(f.date)} · {km(f.odometer_km)} · {Number(f.liters).toLocaleString("pt-BR")} L × {money(f.price_per_liter)} {f.location ? `· ${f.location}` : ""}</p>
                {f.receipt_path && <p className="mt-1 text-sm"><FileLink path={f.receipt_path}>Ver comprovante</FileLink></p>}
              </div>
              <div className="text-right">
                <p className="tnum font-extrabold">{money(f.total_value)}</p>
                {canEdit && <Button variant="danger" className="mt-2" onClick={async () => { if (confirm("Excluir este abastecimento? A despesa ligada na viagem também sai.")) { await fuel.remove(f.id); } }}>Excluir</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
