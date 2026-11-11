"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { dateBR, km, money, today } from "@/lib/format";
import { MAINT_KIND, VEHICLE_STATUS, averageConsumption, consumptionAlert, consumptionSegments, expiryState, maintCost, maintenanceCostPerKm } from "@/lib/fleet";
import type { FuelLogRow, MaintenanceRecord, TireRow, VehicleDoc, VehicleFull } from "@/lib/types";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Stat, linkBtnGhost } from "@/components/ui";
import { FileField, FileLink } from "@/components/FileField";

const expiryBadge = { sem_data: ["neutral", "Sem validade"], vencido: ["bad", "Vencido"], vencendo: ["warn", "Vence em breve"], em_dia: ["good", "Em dia"] } as const;

export default function VeiculoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { member } = useAppSession();
  const canEdit = isStaff(member?.role ?? null);
  const [v, setV] = useState<VehicleFull | null>(null);
  const [docs, setDocs] = useState<VehicleDoc[]>([]);
  const [maint, setMaint] = useState<MaintenanceRecord[]>([]);
  const [fuel, setFuel] = useState<FuelLogRow[]>([]);
  const [tires, setTires] = useState<TireRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [doc, setDoc] = useState({ kind: "CRLV", number: "", expires_on: "", file_path: null as string | null });
  const [docErr, setDocErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = getSupabase()!;
    const [a, b, c, d, e] = await Promise.all([
      sb.from("vehicles").select("*").eq("id", id).maybeSingle(),
      sb.from("vehicle_documents").select("*").eq("vehicle_id", id).order("expires_on"),
      sb.from("maintenance_records").select("*").eq("vehicle_id", id).order("done_date", { ascending: false, nullsFirst: true }),
      sb.from("fuel_logs").select("*").eq("vehicle_id", id).order("odometer_km", { ascending: false }),
      sb.from("tires").select("*").eq("vehicle_id", id),
    ]);
    if (a.error || !a.data) setError("Veículo não encontrado ou sem permissão.");
    else {
      setV(a.data as VehicleFull);
      setDocs((b.data ?? []) as VehicleDoc[]);
      setMaint((c.data ?? []) as MaintenanceRecord[]);
      setFuel((d.data ?? []) as FuelLogRow[]);
      setTires((e.data ?? []) as TireRow[]);
    }
    setLoading(false);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function addDoc(e: React.FormEvent) {
    e.preventDefault();
    setDocErr(null);
    const { error } = await getSupabase()!.from("vehicle_documents").insert({
      vehicle_id: id, kind: doc.kind.trim(), number: doc.number.trim() || null, expires_on: doc.expires_on || null, file_path: doc.file_path,
    });
    if (error) return setDocErr("Não foi possível salvar o documento.");
    setDoc({ kind: "CRLV", number: "", expires_on: "", file_path: null });
    load();
  }
  async function delDoc(d: VehicleDoc) {
    if (!confirm(`Excluir o documento ${d.kind}?`)) return;
    await getSupabase()!.from("vehicle_documents").delete().eq("id", d.id);
    load();
  }

  if (loading) return <Loading />;
  if (error || !v) return <ErrorBox message={error ?? "Erro"} />;

  const segs = consumptionSegments(fuel.map((f) => ({ id: f.id, vehicle_id: f.vehicle_id, date: f.date, odometer_km: Number(f.odometer_km), liters: Number(f.liters), full_tank: f.full_tank })));
  const avg = averageConsumption(segs);
  const done = maint.filter((m) => m.status === "concluida");
  const maintTotal = done.reduce((s, m) => s + maintCost(m), 0);
  const odos = done.map((m) => Number(m.odometer_km)).filter((n) => n > 0);
  const base = odos.length ? Math.min(...odos) : 0;
  const mkm = maintenanceCostPerKm(maintTotal, Number(v.odometer_km) - base);

  return (
    <>
      <PageHeader crumb="Veículos" title={`${v.name}${v.plate ? ` · ${v.plate}` : ""}`} subtitle={`${VEHICLE_STATUS[v.status]} · hodômetro ${km(v.odometer_km)}`}
        action={<Link href="/veiculos" className={linkBtnGhost}>Voltar</Link>} />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Consumo real médio" value={avg ? `${avg.toFixed(2).replace(".", ",")} km/l` : "—"} note={segs.length ? `${segs.length} trecho(s) entre tanques cheios` : "Precisa de 2 abastecimentos de tanque cheio"} />
        <Stat label="Consumo de referência" value={`${v.consumption_km_l} km/l`} note={consumptionAlert(avg, v.consumption_km_l) ? "Atenção: consumo real bem abaixo do cadastrado" : "Do cadastro do veículo"} />
        <Stat label="Manutenção realizada" value={money(maintTotal)} note={mkm !== null ? `≈ ${money(mkm)} por km (base: hodômetro das manutenções)` : "Sem base de km para calcular R$/km"} />
      </div>

      <Card className="mb-6">
        <h2 className="text-lg font-extrabold text-pine-950">Documentos e vencimentos</h2>
        {docs.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhum documento cadastrado. Registre CRLV, seguro, ANTT, licenciamento e outros com a data de vencimento.</p> : (
          <ul className="mt-3 divide-y divide-line">
            {docs.map((d) => {
              const [tone, text] = expiryBadge[expiryState(d.expires_on, today())];
              return (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-bold text-pine-950">{d.kind} {d.number && <span className="font-normal text-muted">· {d.number}</span>}</p>
                    <p className="text-sm text-muted">Vencimento: {dateBR(d.expires_on)} {d.file_path && <>· <FileLink path={d.file_path}>Abrir anexo</FileLink></>}</p>
                  </div>
                  <div className="flex items-center gap-2"><Badge tone={tone}>{text}</Badge>{canEdit && <Button variant="danger" onClick={() => delDoc(d)}>Excluir</Button>}</div>
                </li>
              );
            })}
          </ul>
        )}
        {canEdit && member && (
          <form onSubmit={addDoc} className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-4">
            <Field label="Documento"><Input required maxLength={60} value={doc.kind} onChange={(e) => setDoc({ ...doc, kind: e.target.value })} /></Field>
            <Field label="Número"><Input maxLength={60} value={doc.number} onChange={(e) => setDoc({ ...doc, number: e.target.value })} /></Field>
            <Field label="Vencimento"><Input type="date" value={doc.expires_on} onChange={(e) => setDoc({ ...doc, expires_on: e.target.value })} /></Field>
            <div className="self-end"><FileField label="Anexo (opcional)" orgId={member.orgId} folder={`veiculos/${id}`} value={doc.file_path} onChange={(p) => setDoc({ ...doc, file_path: p })} /></div>
            {docErr && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-4">{docErr}</p>}
            <div className="sm:col-span-4"><Button type="submit">Adicionar documento</Button></div>
          </form>
        )}
      </Card>

      <Card className="mb-6">
        <h2 className="text-lg font-extrabold text-pine-950">Histórico de manutenção</h2>
        {maint.length === 0 ? <p className="mt-2 text-sm text-muted">Sem registros. Lance em <Link className="underline" href="/manutencao">Manutenção</Link>.</p> : (
          <ul className="mt-3 divide-y divide-line">
            {maint.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-bold text-pine-950">{MAINT_KIND[m.kind] ?? m.kind} <Badge tone={m.status === "concluida" ? "good" : "info"}>{m.status === "concluida" ? "Concluída" : "Agendada"}</Badge></p>
                  <p className="text-sm text-muted">{dateBR(m.done_date)} {m.odometer_km ? `· ${km(m.odometer_km)}` : ""} {m.supplier ? `· ${m.supplier}` : ""}</p>
                </div>
                <p className="tnum font-extrabold">{money(maintCost(m))}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-extrabold text-pine-950">Pneus montados</h2>
        {tires.filter((t) => t.status === "em_uso").length === 0 ? <p className="mt-2 text-sm text-muted">Nenhum pneu em uso vinculado. Cadastre em <Link className="underline" href="/pneus">Pneus</Link>.</p> : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {tires.filter((t) => t.status === "em_uso").map((t) => (
              <li key={t.id} className="rounded-xl border border-line p-3 text-sm"><span className="font-bold text-pine-950">{t.code}</span> · {t.position ?? "sem posição"} · {t.brand} {t.size}</li>
            ))}
          </ul>
        )}
      </Card>
      <p className="no-print mt-4 text-xs text-muted">Valores de consumo vêm dos abastecimentos lançados; nada aqui é estimado.</p>
    </>
  );
}
