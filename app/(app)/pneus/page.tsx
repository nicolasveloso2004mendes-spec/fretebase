"use client";
import { useMemo, useState } from "react";
import { useTable } from "@/lib/useTable";
import { useRole } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { dateBR, km, money, today, toNumber } from "@/lib/format";
import { TIRE_EVENT, TIRE_STATUS, tireAlert, tireCostPerKm, tireKm } from "@/lib/fleet";
import { getSupabase } from "@/lib/supabase";
import type { TireRow, VehicleFull } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select } from "@/components/ui";

const blank = { code: "", brand: "", model: "", size: "", vehicle_id: "", position: "", status: "estoque", installed_km: "", km_before: "", purchase_cost: "", alert_km: "" };

export default function PneusPage() {
  const canEdit = isStaff(useRole());
  const t = useTable<TireRow>("tires", { select: "*, vehicles(name, plate)", order: "code" });
  const vs = useTable<VehicleFull>("vehicles", { order: "name" });
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ev, setEv] = useState<{ tire: TireRow; kind: string; cost: string; notes: string } | null>(null);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });
  const odo = useMemo(() => Object.fromEntries(vs.rows.map((v) => [v.id, Number(v.odometer_km)])), [vs.rows]);
  const num = (v: string) => (v.trim() === "" ? null : toNumber(v));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const mounted = form.status === "em_uso";
    if (mounted && !form.vehicle_id) { setErr("Pneu em uso precisa de um veículo."); setBusy(false); return; }
    const values = {
      code: form.code.trim(), brand: form.brand.trim() || null, model: form.model.trim() || null, size: form.size.trim() || null,
      vehicle_id: mounted ? form.vehicle_id : null, position: mounted ? form.position.trim() || null : null, status: form.status,
      installed_at: mounted ? today() : null, installed_km: mounted ? num(form.installed_km) ?? odo[form.vehicle_id] ?? 0 : null,
      km_before: toNumber(form.km_before), purchase_cost: toNumber(form.purchase_cost), alert_km: num(form.alert_km),
    };
    try {
      if (editing) await t.update(editing, values); else await t.insert(values);
      setForm(blank); setEditing(null); setOpen(false);
    } catch (x) { setErr(`Não foi possível salvar: ${(x as Error).message}`); }
    setBusy(false);
  }

  function edit(r: TireRow) {
    const s = (n: number | null) => (n === null ? "" : String(n));
    setForm({ code: r.code, brand: r.brand ?? "", model: r.model ?? "", size: r.size ?? "", vehicle_id: r.vehicle_id ?? "", position: r.position ?? "", status: r.status, installed_km: s(r.installed_km), km_before: String(r.km_before), purchase_cost: String(r.purchase_cost), alert_km: s(r.alert_km) });
    setEditing(r.id); setOpen(true);
  }

  /** Registra o evento no histórico e atualiza o pneu de forma coerente (km acumulado preservado). */
  async function saveEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!ev) return;
    const { tire } = ev;
    const sb = getSupabase()!;
    const vOdo = tire.vehicle_id ? odo[tire.vehicle_id] ?? null : null;
    const accumulated = tireKm(tire, vOdo);
    const cost = toNumber(ev.cost);
    const ins = await sb.from("tire_events").insert({ tire_id: tire.id, kind: ev.kind, date: today(), odometer_km: vOdo, cost, vehicle_id: tire.vehicle_id, position: tire.position, notes: ev.notes.trim() || null });
    if (ins.error) return setErr("Não foi possível registrar o evento.");
    let patch: Record<string, unknown> | null = null;
    if (ev.kind === "recapagem") patch = { status: "estoque", vehicle_id: null, position: null, installed_km: null, installed_at: null, km_before: 0, retread_count: tire.retread_count + 1, purchase_cost: Number(tire.purchase_cost) + cost };
    else if (ev.kind === "descarte" || ev.kind === "troca") patch = { status: "descartado", vehicle_id: null, position: null, installed_km: null, km_before: accumulated };
    if (patch) await sb.from("tires").update(patch).eq("id", tire.id);
    setEv(null); t.reload();
  }

  return (
    <>
      <PageHeader crumb="Pneus" title="Pneus" subtitle="Cadastro por pneu, posição no veículo, km rodado, recapagens e alerta de troca por quilometragem."
        action={canEdit && !open && <Button onClick={() => { setForm(blank); setEditing(null); setOpen(true); }}>Novo pneu</Button>} />

      {open && (
        <Card className="mb-6">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2 lg:col-span-3">{editing ? "Editar pneu" : "Novo pneu"}</h2>
            <Field label="Código / fogo"><Input required maxLength={40} value={form.code} onChange={set("code")} /></Field>
            <Field label="Marca"><Input maxLength={60} value={form.brand} onChange={set("brand")} /></Field>
            <Field label="Modelo"><Input maxLength={60} value={form.model} onChange={set("model")} /></Field>
            <Field label="Medida" hint="Ex.: 295/80 R22.5"><Input maxLength={30} value={form.size} onChange={set("size")} /></Field>
            <Field label="Situação"><Select value={form.status} onChange={set("status")}>{Object.entries(TIRE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Custo de compra (R$)"><Input inputMode="decimal" value={form.purchase_cost} onChange={set("purchase_cost")} /></Field>
            {form.status === "em_uso" && (<>
              <Field label="Veículo"><Select required value={form.vehicle_id} onChange={set("vehicle_id")}><option value="">Escolha</option>{vs.rows.map((v) => <option key={v.id} value={v.id}>{v.name} {v.plate ?? ""}</option>)}</Select></Field>
              <Field label="Posição" hint="Ex.: eixo 1 esquerdo."><Input maxLength={40} value={form.position} onChange={set("position")} /></Field>
              <Field label="Hodômetro do veículo na montagem (km)" hint="Em branco usa o hodômetro atual."><Input inputMode="decimal" value={form.installed_km} onChange={set("installed_km")} /></Field>
            </>)}
            <Field label="Km já rodados antes (usado/recapado)"><Input inputMode="decimal" value={form.km_before} onChange={set("km_before")} /></Field>
            <Field label="Alertar ao atingir (km)"><Input inputMode="decimal" value={form.alert_km} onChange={set("alert_km")} /></Field>
            {err && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2 lg:col-span-3">{err}</p>}
            <div className="flex gap-3 sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar pneu"}</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button></div>
          </form>
        </Card>
      )}

      {ev && (
        <Card className="mb-6">
          <form onSubmit={saveEvent} className="grid gap-4 sm:grid-cols-3">
            <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-3">Registrar evento no pneu {ev.tire.code}</h2>
            <Field label="Evento"><Select value={ev.kind} onChange={(e) => setEv({ ...ev, kind: e.target.value })}>{Object.entries(TIRE_EVENT).filter(([k]) => k !== "instalacao").map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Custo (R$)"><Input inputMode="decimal" value={ev.cost} onChange={(e) => setEv({ ...ev, cost: e.target.value })} /></Field>
            <Field label="Observação"><Input maxLength={200} value={ev.notes} onChange={(e) => setEv({ ...ev, notes: e.target.value })} /></Field>
            <p className="text-xs text-muted sm:col-span-3">Recapagem devolve o pneu ao estoque com contagem de recapagens +1 e km zerado. Troca/descarte encerra o pneu e guarda o km total rodado. Rodízio só registra no histórico.</p>
            <div className="flex gap-3 sm:col-span-3"><Button type="submit">Registrar</Button><Button variant="ghost" onClick={() => setEv(null)}>Cancelar</Button></div>
          </form>
        </Card>
      )}

      {t.loading ? <Loading /> : t.error ? <ErrorBox message={t.error} onRetry={t.reload} /> : t.rows.length === 0 ? (
        <Empty title="Nenhum pneu cadastrado" text="Cadastre os pneus da frota para acompanhar km rodado e custo por km." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {t.rows.map((r) => {
            const kmRun = tireKm(r, r.vehicle_id ? odo[r.vehicle_id] : null);
            const al = tireAlert(r, r.vehicle_id ? odo[r.vehicle_id] : null);
            const cpk = tireCostPerKm(Number(r.purchase_cost), kmRun);
            return (
              <li key={r.id} className="rounded-2xl border border-line bg-white p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-lg font-bold text-pine-950">{r.code} <span className="text-sm font-semibold text-muted">{[r.brand, r.model, r.size].filter(Boolean).join(" · ")}</span></p>
                  <Badge tone={r.status === "em_uso" ? "good" : r.status === "descartado" ? "neutral" : "info"}>{TIRE_STATUS[r.status]}</Badge>
                </div>
                <p className="tnum mt-1 text-sm text-muted">{r.vehicles ? `${r.vehicles.name} · ${r.position ?? "sem posição"}` : "Sem veículo"} · {km(kmRun)} rodados · {r.retread_count} recapagem(ns)</p>
                <p className="tnum text-sm text-muted">Compra {money(r.purchase_cost)}{cpk !== null ? ` · ≈ ${money(cpk)}/km` : ""}{r.installed_at ? ` · montado em ${dateBR(r.installed_at)}` : ""}</p>
                {al && <div className="mt-2"><Badge tone={al === "vencido" ? "bad" : "warn"}>{al === "vencido" ? `Passou de ${km(r.alert_km)}: trocar` : "Perto do km de troca"}</Badge></div>}
                {canEdit && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="ghost" onClick={() => edit(r)}>Editar</Button>
                    {r.status === "em_uso" && <Button variant="ghost" onClick={() => setEv({ tire: r, kind: "rodizio", cost: "", notes: "" })}>Registrar evento</Button>}
                    <Button variant="danger" onClick={async () => { if (confirm(`Excluir o pneu ${r.code}?`)) await t.remove(r.id); }}>Excluir</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
