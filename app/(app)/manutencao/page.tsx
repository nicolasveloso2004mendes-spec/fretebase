"use client";
import { useMemo, useState } from "react";
import { useTable } from "@/lib/useTable";
import { useRole } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { dateBR, km, money, today, toNumber } from "@/lib/format";
import { MAINT_KIND, maintCost, maintenanceAlerts } from "@/lib/fleet";
import type { MaintenanceRecord, VehicleFull } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";

const blank = { vehicle_id: "", kind: "oleo", description: "", status: "concluida", done_date: today(), odometer_km: "", parts_cost: "", labor_cost: "", supplier: "", next_due_date: "", next_due_km: "" };

export default function ManutencaoPage() {
  const canEdit = isStaff(useRole());
  const m = useTable<MaintenanceRecord>("maintenance_records", { select: "*, vehicles(name, plate)" });
  const vs = useTable<VehicleFull>("vehicles", { order: "name" });
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const numOrNull = (v: string) => (v.trim() === "" ? null : toNumber(v));

  const odos = useMemo(() => Object.fromEntries(vs.rows.map((v) => [v.id, Number(v.odometer_km)])), [vs.rows]);
  const alerts = useMemo(() => maintenanceAlerts(m.rows, odos, today()), [m.rows, odos]);
  const vname = (id: string) => vs.rows.find((v) => v.id === id)?.name ?? "Veículo";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const values = {
      vehicle_id: form.vehicle_id, kind: form.kind, description: form.description.trim() || null, status: form.status,
      done_date: form.status === "concluida" ? form.done_date || today() : form.done_date || null,
      odometer_km: numOrNull(form.odometer_km), parts_cost: toNumber(form.parts_cost), labor_cost: toNumber(form.labor_cost),
      supplier: form.supplier.trim() || null, next_due_date: form.next_due_date || null, next_due_km: numOrNull(form.next_due_km),
    };
    try {
      if (editing) await m.update(editing, values);
      else await m.insert(values);
      setForm(blank); setEditing(null); setOpen(false);
      vs.reload();
    } catch (x) {
      setErr(`Não foi possível salvar: ${(x as Error).message}`);
    }
    setBusy(false);
  }

  function edit(r: MaintenanceRecord) {
    const s = (n: number | null) => (n === null ? "" : String(n));
    setForm({ vehicle_id: r.vehicle_id, kind: r.kind, description: r.description ?? "", status: r.status, done_date: r.done_date ?? "", odometer_km: s(r.odometer_km), parts_cost: String(r.parts_cost), labor_cost: String(r.labor_cost), supplier: r.supplier ?? "", next_due_date: r.next_due_date ?? "", next_due_km: s(r.next_due_km) });
    setEditing(r.id); setOpen(true);
  }

  const rows = m.rows.filter((r) => !filter || r.vehicle_id === filter);

  return (
    <>
      <PageHeader crumb="Manutenção" title="Manutenção" subtitle="Registre revisões e consertos, com custo de peças e mão de obra e a próxima data ou km. O sistema avisa o que está vencendo."
        action={canEdit && !open && <Button onClick={() => { setForm({ ...blank, vehicle_id: vs.rows[0]?.id ?? "" }); setEditing(null); setOpen(true); }} disabled={vs.rows.length === 0}>Nova manutenção</Button>} />

      {alerts.length > 0 && (
        <Card className="mb-6 border-amber-200 bg-amber-50">
          <h2 className="font-extrabold text-warn">Alertas de manutenção ({alerts.length})</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {alerts.map((a) => (
              <li key={a.recordId + a.reason}><Badge tone={a.level === "vencida" ? "bad" : "warn"}>{a.level === "vencida" ? "Vencida" : "Próxima"}</Badge> <b>{vname(a.vehicle_id)}</b> · {MAINT_KIND[a.kind] ?? a.kind}: {a.reason}</li>
            ))}
          </ul>
        </Card>
      )}

      {open && (
        <Card className="mb-6">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2 lg:col-span-3">{editing ? "Editar manutenção" : "Nova manutenção"}</h2>
            <Field label="Veículo"><Select required value={form.vehicle_id} onChange={set("vehicle_id")}>{vs.rows.map((v) => <option key={v.id} value={v.id}>{v.name} {v.plate ?? ""}</option>)}</Select></Field>
            <Field label="Tipo"><Select value={form.kind} onChange={set("kind")}>{Object.entries(MAINT_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
            <Field label="Situação"><Select value={form.status} onChange={set("status")}><option value="concluida">Concluída</option><option value="agendada">Agendada</option></Select></Field>
            <Field label={form.status === "concluida" ? "Data realizada" : "Data prevista"}><Input type="date" value={form.done_date} onChange={set("done_date")} /></Field>
            <Field label="Hodômetro na manutenção (km)"><Input inputMode="decimal" value={form.odometer_km} onChange={set("odometer_km")} /></Field>
            <Field label="Fornecedor / oficina"><Input maxLength={120} value={form.supplier} onChange={set("supplier")} /></Field>
            <Field label="Peças (R$)"><Input inputMode="decimal" value={form.parts_cost} onChange={set("parts_cost")} /></Field>
            <Field label="Mão de obra (R$)"><Input inputMode="decimal" value={form.labor_cost} onChange={set("labor_cost")} /></Field>
            <div />
            <Field label="Próxima em (data)"><Input type="date" value={form.next_due_date} onChange={set("next_due_date")} /></Field>
            <Field label="Próxima em (km)"><Input inputMode="decimal" value={form.next_due_km} onChange={set("next_due_km")} /></Field>
            <div className="sm:col-span-2 lg:col-span-3"><Field label="Descrição"><Textarea maxLength={500} value={form.description} onChange={set("description")} /></Field></div>
            {err && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2 lg:col-span-3">{err}</p>}
            <div className="flex gap-3 sm:col-span-2 lg:col-span-3"><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button></div>
          </form>
        </Card>
      )}

      <div className="mb-4 max-w-xs"><Field label="Filtrar por veículo"><Select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Todos</option>{vs.rows.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field></div>

      {m.loading ? <Loading /> : m.error ? <ErrorBox message={m.error} onRetry={m.reload} /> : rows.length === 0 ? (
        <Empty title="Nenhuma manutenção registrada" text={vs.rows.length === 0 ? "Cadastre um veículo primeiro." : "Registre a primeira manutenção para acompanhar custos e prazos."} />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-pine-950">{MAINT_KIND[r.kind] ?? r.kind} · {r.vehicles?.name} {r.vehicles?.plate && `(${r.vehicles.plate})`} <Badge tone={r.status === "concluida" ? "good" : "info"}>{r.status === "concluida" ? "Concluída" : "Agendada"}</Badge></p>
                  <p className="mt-1 text-sm text-muted">{dateBR(r.done_date)}{r.odometer_km ? ` · ${km(r.odometer_km)}` : ""}{r.supplier ? ` · ${r.supplier}` : ""}</p>
                  {(r.next_due_date || r.next_due_km) && <p className="text-sm text-muted">Próxima: {r.next_due_date ? dateBR(r.next_due_date) : ""} {r.next_due_km ? `· ${km(r.next_due_km)}` : ""}</p>}
                  {r.description && <p className="mt-1 text-sm">{r.description}</p>}
                </div>
                <div className="text-right"><p className="tnum font-extrabold">{money(maintCost(r))}</p><p className="tnum text-xs text-muted">peças {money(r.parts_cost)} · mão de obra {money(r.labor_cost)}</p></div>
              </div>
              {canEdit && (
                <div className="mt-3 flex gap-2">
                  <Button variant="ghost" onClick={() => edit(r)}>Editar</Button>
                  <Button variant="danger" onClick={async () => { if (confirm("Excluir este registro?")) await m.remove(r.id); }}>Excluir</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
