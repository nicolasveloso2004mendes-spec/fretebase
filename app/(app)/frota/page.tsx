"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { dateBR, money, today } from "@/lib/format";
import { MAINT_KIND, VEHICLE_STATUS, expiryState, maintCost, maintenanceAlerts, tireAlert } from "@/lib/fleet";
import type { Driver, FuelLogRow, MaintenanceRecord, TireRow, TripFull, VehicleDoc, VehicleFull } from "@/lib/types";
import { Badge, Card, ErrorBox, Loading, PageHeader, Stat } from "@/components/ui";

export default function FrotaPage() {
  const [d, setD] = useState<{ v: VehicleFull[]; dr: Driver[]; docs: VehicleDoc[]; m: MaintenanceRecord[]; f: FuelLogRow[]; t: TireRow[]; tr: TripFull[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const sb = getSupabase()!;
    Promise.all([
      sb.from("vehicles").select("*"), sb.from("drivers").select("*"), sb.from("vehicle_documents").select("*"),
      sb.from("maintenance_records").select("*"), sb.from("fuel_logs").select("*"), sb.from("tires").select("*"), sb.from("trips").select("*"),
    ]).then((r) => {
      if (r.some((x) => x.error)) return setErr("Não foi possível carregar o painel da frota.");
      setD({ v: r[0].data as VehicleFull[], dr: r[1].data as Driver[], docs: r[2].data as VehicleDoc[], m: r[3].data as MaintenanceRecord[], f: r[4].data as FuelLogRow[], t: r[5].data as TireRow[], tr: r[6].data as TripFull[] });
    });
  }, []);

  const view = useMemo(() => {
    if (!d) return null;
    const td = today();
    const odo = Object.fromEntries(d.v.map((v) => [v.id, Number(v.odometer_km)]));
    const name = (id: string) => d.v.find((v) => v.id === id)?.name ?? "Veículo";
    const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    return {
      counts: Object.keys(VEHICLE_STATUS).map((k) => [k, d.v.filter((v) => v.status === k).length] as const),
      mAlerts: maintenanceAlerts(d.m, odo, td),
      docAlerts: d.docs.filter((x) => ["vencido", "vencendo"].includes(expiryState(x.expires_on, td))),
      cnh: d.dr.filter((x) => x.active && ["vencido", "vencendo"].includes(expiryState(x.cnh_expiry, td))),
      tireAlerts: d.t.filter((x) => tireAlert(x, x.vehicle_id ? odo[x.vehicle_id] : null)),
      fuel30: d.f.filter((x) => x.date >= since).reduce((s, x) => s + Number(x.total_value), 0),
      maint30: d.m.filter((x) => x.status === "concluida" && (x.done_date ?? "") >= since).reduce((s, x) => s + maintCost(x), 0),
      active: d.tr.filter((x) => x.status === "agendada" || x.status === "em_viagem").length,
      name, td,
    };
  }, [d]);

  if (err) return <ErrorBox message={err} />;
  if (!d || !view) return <Loading />;
  const none = !view.mAlerts.length && !view.docAlerts.length && !view.cnh.length && !view.tireAlerts.length;

  return (
    <>
      <PageHeader crumb="Frota" title="Painel da frota" subtitle="Situação dos veículos, vencimentos e custos dos últimos 30 dias, calculados dos registros lançados." />
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {view.counts.map(([k, n]) => <Stat key={k} label={VEHICLE_STATUS[k]} value={String(n)} />)}
        <Stat label="Viagens em aberto" value={String(view.active)} />
        <Stat label="Combustível (30 dias)" value={money(view.fuel30)} />
        <Stat label="Manutenção (30 dias)" value={money(view.maint30)} />
      </div>
      <Card>
        <h2 className="text-lg font-extrabold text-pine-950">Alertas</h2>
        {none ? <p className="mt-2 text-sm text-muted">Nada vencido ou perto de vencer com base nos dados lançados.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {view.mAlerts.map((a) => <li key={a.recordId + a.reason}><Badge tone={a.level === "vencida" ? "bad" : "warn"}>Manutenção</Badge> {view.name(a.vehicle_id)} · {MAINT_KIND[a.kind] ?? a.kind}: {a.reason}</li>)}
            {view.docAlerts.map((x) => <li key={x.id}><Badge tone={expiryState(x.expires_on, view.td) === "vencido" ? "bad" : "warn"}>Documento</Badge> {view.name(x.vehicle_id)} · {x.kind} vence em {dateBR(x.expires_on)}</li>)}
            {view.cnh.map((x) => <li key={x.id}><Badge tone={expiryState(x.cnh_expiry, view.td) === "vencido" ? "bad" : "warn"}>CNH</Badge> {x.name} vence em {dateBR(x.cnh_expiry)}</li>)}
            {view.tireAlerts.map((x) => <li key={x.id}><Badge tone="warn">Pneu</Badge> {x.code} perto ou acima do km de troca</li>)}
          </ul>
        )}
      </Card>
      <p className="mt-4 text-sm"><Link className="underline" href="/veiculos">Ver veículos</Link> · <Link className="underline" href="/manutencao">Manutenção</Link></p>
    </>
  );
}
