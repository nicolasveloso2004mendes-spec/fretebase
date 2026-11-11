"use client";
import Link from "next/link";
import { useState } from "react";
import { useTable } from "@/lib/useTable";
import { useRole } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { km, money, toNumber } from "@/lib/format";
import { VEHICLE_STATUS } from "@/lib/fleet";
import type { VehicleFull } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, linkBtnGhost } from "@/components/ui";

const blank = {
  name: "", plate: "", brand: "", model: "", year: "", truck_type: "", axles: "", axle_config: "", capacity_kg: "", odometer_km: "",
  fuel_type: "diesel", status: "disponivel", consumption: "", consumption_loaded: "", consumption_empty: "", maintenance: "", tire: "",
};
const numOrNull = (v: string) => (v.trim() === "" ? null : toNumber(v));

export default function VeiculosPage() {
  const canEdit = isStaff(useRole());
  const { rows, loading, error, reload, insert, update, remove } = useTable<VehicleFull>("vehicles", { order: "name" });
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    const values = {
      name: form.name.trim(),
      plate: form.plate.trim().toUpperCase() || null,
      brand: form.brand.trim() || null,
      model: form.model.trim() || null,
      year: numOrNull(form.year),
      truck_type: form.truck_type.trim() || null,
      axles: numOrNull(form.axles),
      axle_config: form.axle_config.trim() || null,
      capacity_kg: numOrNull(form.capacity_kg),
      odometer_km: toNumber(form.odometer_km),
      fuel_type: form.fuel_type || null,
      status: form.status,
      consumption_km_l: toNumber(form.consumption),
      consumption_loaded: numOrNull(form.consumption_loaded),
      consumption_empty: numOrNull(form.consumption_empty),
      maintenance_per_km: toNumber(form.maintenance),
      tire_per_km: toNumber(form.tire),
    };
    try {
      if (editing) await update(editing, values);
      else await insert(values);
      setForm(blank);
      setEditing(null);
      setOpen(false);
    } catch (x) {
      setFormError(`Não foi possível salvar: ${(x as Error).message}`);
    }
    setBusy(false);
  }

  function edit(v: VehicleFull) {
    const s = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));
    setForm({
      name: v.name, plate: v.plate ?? "", brand: v.brand ?? "", model: v.model ?? "", year: s(v.year), truck_type: v.truck_type ?? "",
      axles: s(v.axles), axle_config: v.axle_config ?? "", capacity_kg: s(v.capacity_kg), odometer_km: s(v.odometer_km),
      fuel_type: v.fuel_type ?? "diesel", status: v.status, consumption: s(v.consumption_km_l), consumption_loaded: s(v.consumption_loaded),
      consumption_empty: s(v.consumption_empty), maintenance: s(v.maintenance_per_km), tire: s(v.tire_per_km),
    });
    setEditing(v.id);
    setOpen(true);
  }

  async function del(v: VehicleFull) {
    if (!confirm(`Excluir o veículo "${v.name}"? Viagens, abastecimentos e manutenções ligados a ele podem impedir a exclusão. Prefira marcá-lo como inativo.`)) return;
    try {
      await remove(v.id);
    } catch {
      alert("Não foi possível excluir. Há registros ligados a este veículo; marque-o como inativo.");
    }
  }

  return (
    <>
      <PageHeader
        crumb="Veículos"
        title="Veículos"
        subtitle="Cadastro da frota: dados do caminhão, hodômetro, situação e custos de referência que alimentam o simulador."
        action={canEdit && !open && <Button onClick={() => { setForm(blank); setEditing(null); setOpen(true); }}>Novo veículo</Button>}
      />

      {open && (
        <Card className="mb-6">
          <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2 lg:col-span-3">{editing ? "Editar veículo" : "Novo veículo"}</h2>
            <Field label="Nome do veículo" hint="Ex.: Truck baú, Carreta 3 eixos."><Input required maxLength={120} value={form.name} onChange={set("name")} /></Field>
            <Field label="Placa"><Input maxLength={8} value={form.plate} onChange={set("plate")} /></Field>
            <Field label="Situação">
              <Select value={form.status} onChange={set("status")}>
                {Object.entries(VEHICLE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Marca"><Input maxLength={60} value={form.brand} onChange={set("brand")} /></Field>
            <Field label="Modelo"><Input maxLength={60} value={form.model} onChange={set("model")} /></Field>
            <Field label="Ano"><Input inputMode="numeric" value={form.year} onChange={set("year")} /></Field>
            <Field label="Tipo" hint="Truck, carreta, toco, VUC…"><Input maxLength={60} value={form.truck_type} onChange={set("truck_type")} /></Field>
            <Field label="Eixos"><Input inputMode="numeric" value={form.axles} onChange={set("axles")} /></Field>
            <Field label="Configuração de eixos" hint="Ex.: 6x2, 6x4."><Input maxLength={20} value={form.axle_config} onChange={set("axle_config")} /></Field>
            <Field label="Capacidade (kg)"><Input inputMode="decimal" value={form.capacity_kg} onChange={set("capacity_kg")} /></Field>
            <Field label="Hodômetro atual (km)"><Input inputMode="decimal" value={form.odometer_km} onChange={set("odometer_km")} /></Field>
            <Field label="Combustível">
              <Select value={form.fuel_type} onChange={set("fuel_type")}>
                <option value="diesel">Diesel</option><option value="diesel_s10">Diesel S10</option><option value="gasolina">Gasolina</option><option value="etanol">Etanol</option><option value="gnv">GNV</option>
              </Select>
            </Field>
            <Field label="Consumo médio (km/l)" hint="Usado no simulador."><Input required inputMode="decimal" value={form.consumption} onChange={set("consumption")} /></Field>
            <Field label="Consumo carregado (km/l)"><Input inputMode="decimal" value={form.consumption_loaded} onChange={set("consumption_loaded")} /></Field>
            <Field label="Consumo vazio (km/l)"><Input inputMode="decimal" value={form.consumption_empty} onChange={set("consumption_empty")} /></Field>
            <Field label="Manutenção (R$ por km)"><Input inputMode="decimal" value={form.maintenance} onChange={set("maintenance")} /></Field>
            <Field label="Pneus (R$ por km)"><Input inputMode="decimal" value={form.tire} onChange={set("tire")} /></Field>
            {formError && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2 lg:col-span-3">{formError}</p>}
            <div className="flex gap-3 sm:col-span-2 lg:col-span-3">
              <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar veículo"}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            </div>
          </form>
        </Card>
      )}

      {loading ? <Loading /> : error ? <ErrorBox message={error} onRetry={reload} /> : rows.length === 0 ? (
        <Empty title="Nenhum veículo cadastrado" text="Cadastre seus caminhões com consumo e custo por km para cotar mais rápido." />
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((v) => (
            <li key={v.id} className="rounded-2xl border border-line bg-white p-5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-lg font-bold text-pine-950">{v.name} {v.plate && <span className="text-sm font-semibold text-muted">· {v.plate}</span>}</p>
                <Badge tone={v.status === "disponivel" ? "good" : v.status === "em_viagem" ? "info" : v.status === "manutencao" ? "warn" : "neutral"}>{VEHICLE_STATUS[v.status]}</Badge>
              </div>
              <p className="tnum mt-1 text-sm text-muted">
                {[v.brand, v.model, v.year].filter(Boolean).join(" ") || "Dados do veículo não preenchidos"} · {km(v.odometer_km)}
              </p>
              <p className="tnum mt-1 text-sm text-muted">{v.consumption_km_l} km/l · manutenção {money(v.maintenance_per_km)}/km · pneus {money(v.tire_per_km)}/km</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/veiculos/${v.id}`} className={linkBtnGhost}>Detalhes e histórico</Link>
                {canEdit && <Button variant="ghost" onClick={() => edit(v)}>Editar</Button>}
                {canEdit && <Button variant="danger" onClick={() => del(v)}>Excluir</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
