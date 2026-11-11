"use client";
import { useState } from "react";
import Link from "next/link";
import { useTable } from "@/lib/useTable";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { CIOT_STATUS, CIOT_TYPE, DEFAULT_CIOT_RULES, ciotSuggestion, type CiotRules, type CiotType } from "@/lib/compliance";
import { money, toNumber } from "@/lib/format";
import { Notice, Table, Td } from "@/components/extra";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import type { Trip } from "@/lib/types";

type Rec = { id: string; trip_id: string; contracted_type: CiotType; hiring_category: string | null; rntrc: string | null; freight_value: number | null; payment_method: string | null; contractor: string | null; contracted: string | null; status: string; ciot_number: string | null; admin_cost: number; notes: string | null };
const TONE: Record<string, "neutral" | "good" | "warn" | "bad" | "info"> = { aguardando_analise: "warn", nao_aplicavel: "neutral", necessario: "info", pendente_registro: "warn", registrado: "good", falha_integracao: "bad" };

export default function CiotPage() {
  const { member, org } = useAppSession();
  const staff = isStaff(member?.role ?? null);
  const recs = useTable<Rec>("ciot_records");
  const trips = useTable<Trip>("trips");
  const [sel, setSel] = useState<string | null>(null);
  const rules: CiotRules = ((org?.settings as { ciot?: CiotRules } | undefined)?.ciot) ?? DEFAULT_CIOT_RULES;
  const rec = sel ? recs.rows.find((r) => r.trip_id === sel) : undefined;
  const trip = trips.rows.find((t) => t.id === sel);
  const loading = recs.loading || trips.loading;

  return (
    <>
      <PageHeader crumb="Fiscal" title="Controle de CIOT" subtitle="Análise e acompanhamento do CIOT por viagem." />
      <Notice tone="warn">Nem toda viagem exige CIOT, e este sistema <b>não registra CIOT na ANTT nem cobra taxa</b>: ele ajuda a analisar a aplicabilidade e a acompanhar o status. As regras abaixo são configuráveis em Configurações e devem ser confirmadas por profissional habilitado. A integração com fornecedor habilitado ainda não está configurada.</Notice>
      {loading ? <Loading /> : recs.error ? <ErrorBox message={recs.error} onRetry={recs.reload} /> : (
        <>
          {sel && trip && staff && <CiotForm key={sel} trip={trip} rec={rec} rules={rules} onDone={() => { setSel(null); recs.reload(); }} onCancel={() => setSel(null)} />}
          {trips.rows.filter((t) => t.status !== "cancelada").length === 0 ? <Empty title="Sem viagens" text="Cadastre viagens para analisar o CIOT." /> : (
            <Table head={["Viagem", "Frete", "Contratado", "Status do CIOT", ""]}>
              {trips.rows.filter((t) => t.status !== "cancelada").map((t) => {
                const r = recs.rows.find((x) => x.trip_id === t.id);
                return (
                  <tr key={t.id}>
                    <Td><Link className="font-semibold underline" href={`/viagens/${t.id}`}>{t.origin} → {t.destination}</Link></Td>
                    <Td className="tnum">{money(t.freight_value)}</Td>
                    <Td>{r ? CIOT_TYPE[r.contracted_type] : "—"}</Td>
                    <Td><Badge tone={r ? TONE[r.status] : "warn"}>{r ? CIOT_STATUS[r.status] : "Aguardando análise"}</Badge>{r?.ciot_number && <p className="text-xs text-muted">Nº {r.ciot_number}</p>}</Td>
                    <Td>{staff && <Button variant="ghost" onClick={() => { setSel(t.id); window.scrollTo({ top: 0 }); }}>{r ? "Editar" : "Analisar"}</Button>}</Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </>
      )}
    </>
  );
}

function CiotForm({ trip, rec, rules, onDone, onCancel }: { trip: Trip; rec?: Rec; rules: CiotRules; onDone: () => void; onCancel: () => void }) {
  const [v, setV] = useState({
    contracted_type: (rec?.contracted_type ?? "frota_propria") as CiotType, hiring_category: rec?.hiring_category ?? "", rntrc: rec?.rntrc ?? "", payment_method: rec?.payment_method ?? "",
    contractor: rec?.contractor ?? "", contracted: rec?.contracted ?? "", status: rec?.status ?? "aguardando_analise", ciot_number: rec?.ciot_number ?? "", admin_cost: rec ? String(rec.admin_cost) : "0", notes: rec?.notes ?? "",
  });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sugg = ciotSuggestion(v.contracted_type, rules);
  const s = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (v.status === "registrado" && !v.ciot_number.trim()) return setErr("Informe o número do CIOT registrado no fornecedor habilitado.");
    setBusy(true); setErr(null);
    const row = { trip_id: trip.id, contracted_type: v.contracted_type, hiring_category: v.hiring_category || null, rntrc: v.rntrc || null, freight_value: trip.freight_value, payment_method: v.payment_method || null,
      contractor: v.contractor || null, contracted: v.contracted || null, status: v.status, ciot_number: v.ciot_number || null, admin_cost: toNumber(v.admin_cost), notes: v.notes || null };
    const { error } = await getSupabase()!.from("ciot_records").upsert(row, { onConflict: "trip_id" });
    setBusy(false);
    if (error) return setErr("Não foi possível salvar.");
    onDone();
  }
  return (
    <Card className="mb-6">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2">{trip.origin} → {trip.destination}</h2>
        <Field label="Tipo de transportador contratado"><Select value={v.contracted_type} onChange={s("contracted_type")}>{Object.entries(CIOT_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Categoria de contratação"><Input value={v.hiring_category} onChange={s("hiring_category")} /></Field>
        <Field label="RNTRC (quando aplicável)"><Input value={v.rntrc} onChange={s("rntrc")} /></Field>
        <Field label="Forma de pagamento"><Input value={v.payment_method} onChange={s("payment_method")} /></Field>
        <Field label="Contratante"><Input value={v.contractor} onChange={s("contractor")} /></Field>
        <Field label="Contratado"><Input value={v.contracted} onChange={s("contracted")} /></Field>
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900 sm:col-span-2">
          <b>Análise pela regra configurada:</b> {sugg.reason}
          {v.status !== sugg.status && <Button variant="ghost" className="ml-3" onClick={() => setV({ ...v, status: sugg.status })}>Aplicar “{CIOT_STATUS[sugg.status]}”</Button>}
        </div>
        <Field label="Status"><Select value={v.status} onChange={s("status")}>{Object.entries(CIOT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Número do CIOT"><Input value={v.ciot_number} onChange={s("ciot_number")} /></Field>
        <Field label="Custo administrativo efetivamente cobrado (R$)" hint="Só o valor realmente cobrado pelo fornecedor. Não há taxa padrão."><Input inputMode="decimal" value={v.admin_cost} onChange={s("admin_cost")} /></Field>
        <div className="sm:col-span-2"><Field label="Observações"><Textarea value={v.notes} onChange={s("notes")} /></Field></div>
        {err && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2">{err}</p>}
        <div className="flex gap-3 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button><Button variant="ghost" onClick={onCancel}>Cancelar</Button></div>
      </form>
    </Card>
  );
}
