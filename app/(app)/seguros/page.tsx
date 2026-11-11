"use client";
import { useState } from "react";
import { useTable } from "@/lib/useTable";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { insuranceCheck } from "@/lib/compliance";
import { expiryState } from "@/lib/fleet";
import { dateBR, money, today, toNumber } from "@/lib/format";
import { FileField, FileLink } from "@/components/FileField";
import { Notice, Table, Tabs, Td } from "@/components/extra";
import { Badge, Button, Card, Empty, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import type { Trip } from "@/lib/types";

type Insurer = { id: string; name: string; contact: string | null; phone: string | null };
type Policy = { id: string; insurer_id: string | null; number: string; kind: string | null; coverage: string | null; limit_value: number | null; deductible: number | null; valid_from: string | null; valid_to: string | null; cargo_types: string | null; risk_rules: string | null; file_path: string | null; notes: string | null };
type Claim = { id: string; policy_id: string | null; trip_id: string | null; date: string; amount: number; description: string | null; status: string };

export default function SegurosPage() {
  const { member } = useAppSession();
  const staff = isStaff(member?.role ?? null);
  const ins = useTable<Insurer>("insurers", { order: "name" });
  const pol = useTable<Policy>("insurance_policies");
  const claims = useTable<Claim>("insurance_claims");
  const trips = useTable<Trip>("trips");
  const [tab, setTab] = useState("apolices");
  const [form, setForm] = useState<null | "apolice" | "seguradora" | "sinistro">(null);
  const [cargo, setCargo] = useState("");
  const loading = ins.loading || pol.loading || claims.loading;
  const check = insuranceCheck(pol.rows, cargo ? toNumber(cargo) : null, today());
  const insName = (id: string | null) => ins.rows.find((i) => i.id === id)?.name ?? "—";

  async function save(table: string, row: Record<string, unknown>, reload: () => void) {
    const { error } = await getSupabase()!.from(table).insert(row);
    if (error) return alert("Não foi possível salvar.");
    setForm(null); reload();
  }

  return (
    <>
      <PageHeader crumb="Fiscal" title="Seguro de cargas" subtitle="Seguradoras, apólices, limites, vigência e sinistros."
        action={staff && !form && <Button onClick={() => setForm(tab === "seguradoras" ? "seguradora" : tab === "sinistros" ? "sinistro" : "apolice")}>Novo cadastro</Button>} />
      <Notice>O sistema compara o valor da carga com os limites e a vigência cadastrados, mas <b>não confirma cobertura</b>: isso depende das condições contratuais e da seguradora. Nenhuma cotação de seguro é inventada.</Notice>
      <Card className="mb-6">
        <h2 className="font-extrabold text-pine-950">Verificar uma carga</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-[14rem_1fr] sm:items-end">
          <Field label="Valor da carga (R$)"><Input inputMode="decimal" value={cargo} onChange={(e) => setCargo(e.target.value)} /></Field>
          <p className={`rounded-xl border px-4 py-3 text-sm ${check.state === "exige_confirmacao" ? "border-amber-200 bg-amber-50 text-warn" : check.state === "sem_dados" ? "border-line bg-paper" : "border-red-200 bg-red-50 text-danger"}`}>{check.text}</p>
        </div>
      </Card>
      {staff && form === "seguradora" && <Mini title="Nova seguradora" fields={[["name", "Nome", true], ["contact", "Contato"], ["phone", "Telefone"]]} onCancel={() => setForm(null)} onSave={(v) => save("insurers", v, ins.reload)} />}
      {staff && form === "apolice" && <PolicyForm insurers={ins.rows} orgId={member!.orgId} onCancel={() => setForm(null)} onSave={(v) => save("insurance_policies", v, pol.reload)} />}
      {staff && form === "sinistro" && (
        <Mini title="Novo sinistro" fields={[["date", "Data", true, "date"], ["amount", "Valor (R$)"], ["description", "Descrição"]]} onCancel={() => setForm(null)}
          extra={(v, set) => (<>
            <Field label="Apólice"><Select value={v.policy_id ?? ""} onChange={(e) => set("policy_id", e.target.value)}><option value="">—</option>{pol.rows.map((p) => <option key={p.id} value={p.id}>{p.number}</option>)}</Select></Field>
            <Field label="Viagem"><Select value={v.trip_id ?? ""} onChange={(e) => set("trip_id", e.target.value)}><option value="">—</option>{trips.rows.map((t) => <option key={t.id} value={t.id}>{t.origin} → {t.destination}</option>)}</Select></Field></>)}
          onSave={(v) => save("insurance_claims", { ...v, amount: toNumber(v.amount), policy_id: v.policy_id || null, trip_id: v.trip_id || null }, claims.reload)} />
      )}
      <Tabs value={tab} onChange={setTab} items={[{ id: "apolices", label: "Apólices" }, { id: "seguradoras", label: "Seguradoras" }, { id: "sinistros", label: "Sinistros" }]} />
      {loading ? <Loading /> : tab === "apolices" ? (pol.rows.length === 0 ? <Empty title="Nenhuma apólice" text="Cadastre as apólices para acompanhar vigência e limites." /> : (
        <Table head={["Apólice", "Seguradora", "Limite / franquia", "Vigência", "Mercadorias / risco", ""]}>
          {pol.rows.map((p) => { const st = expiryState(p.valid_to, today()); return (
            <tr key={p.id}><Td><b>{p.number}</b><p className="text-xs text-muted">{p.kind}</p></Td><Td>{insName(p.insurer_id)}</Td>
              <Td className="tnum">{p.limit_value != null ? money(p.limit_value) : "—"}<p className="text-xs text-muted">franquia {p.deductible != null ? money(p.deductible) : "—"}</p></Td>
              <Td>{dateBR(p.valid_from)} a {dateBR(p.valid_to)}<br /><Badge tone={st === "vencido" ? "bad" : st === "vencendo" ? "warn" : st === "em_dia" ? "good" : "neutral"}>{st === "vencido" ? "Vencida" : st === "vencendo" ? "Vence em breve" : st === "em_dia" ? "Vigente" : "Sem data"}</Badge></Td>
              <Td className="max-w-xs text-xs">{p.cargo_types}{p.risk_rules && <p className="mt-1 text-muted">Risco: {p.risk_rules}</p>}</Td><Td><FileLink path={p.file_path} /></Td></tr>); })}
        </Table>)) : tab === "seguradoras" ? (ins.rows.length === 0 ? <Empty title="Nenhuma seguradora" text="Cadastre a seguradora antes da apólice." /> : (
        <Table head={["Seguradora", "Contato", "Telefone"]}>{ins.rows.map((i) => <tr key={i.id}><Td><b>{i.name}</b></Td><Td>{i.contact ?? "—"}</Td><Td>{i.phone ?? "—"}</Td></tr>)}</Table>)) : (
        claims.rows.length === 0 ? <Empty title="Sem sinistros" text="Nenhum sinistro registrado." /> : (
        <Table head={["Data", "Apólice", "Valor", "Situação", "Descrição"]}>{claims.rows.map((c) => <tr key={c.id}><Td>{dateBR(c.date)}</Td><Td>{pol.rows.find((p) => p.id === c.policy_id)?.number ?? "—"}</Td><Td className="tnum">{money(c.amount)}</Td><Td>{c.status}</Td><Td>{c.description}</Td></tr>)}</Table>))}
    </>
  );
}

function Mini({ title, fields, onSave, onCancel, extra }: { title: string; fields: [string, string, boolean?, string?][]; onSave: (v: Record<string, string>) => void; onCancel: () => void; extra?: (v: Record<string, string>, set: (k: string, x: string) => void) => React.ReactNode }) {
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(fields.map(([k, , , t]) => [k, t === "date" ? today() : ""])));
  const set = (k: string, x: string) => setV((o) => ({ ...o, [k]: x }));
  return (
    <Card className="mb-6"><form onSubmit={(e) => { e.preventDefault(); onSave(v); }} className="grid gap-4 sm:grid-cols-2">
      <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2">{title}</h2>
      {fields.map(([k, l, req, t]) => <Field key={k} label={l}><Input type={t ?? "text"} required={req} value={v[k]} onChange={(e) => set(k, e.target.value)} /></Field>)}
      {extra?.(v, set)}
      <div className="flex gap-3 sm:col-span-2"><Button type="submit">Salvar</Button><Button variant="ghost" onClick={onCancel}>Cancelar</Button></div></form></Card>
  );
}

function PolicyForm({ insurers, orgId, onSave, onCancel }: { insurers: Insurer[]; orgId: string; onSave: (v: Record<string, unknown>) => void; onCancel: () => void }) {
  const [v, setV] = useState({ insurer_id: "", number: "", kind: "", coverage: "", limit_value: "", deductible: "", valid_from: "", valid_to: "", cargo_types: "", risk_rules: "", notes: "" });
  const [file, setFile] = useState<string | null>(null);
  const s = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <Card className="mb-6"><form onSubmit={(e) => { e.preventDefault(); onSave({ ...v, insurer_id: v.insurer_id || null, limit_value: v.limit_value ? toNumber(v.limit_value) : null, deductible: v.deductible ? toNumber(v.deductible) : null, valid_from: v.valid_from || null, valid_to: v.valid_to || null, file_path: file }); }} className="grid gap-4 sm:grid-cols-2">
      <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2">Nova apólice</h2>
      <Field label="Seguradora"><Select value={v.insurer_id} onChange={s("insurer_id")}><option value="">—</option>{insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</Select></Field>
      <Field label="Número da apólice"><Input required value={v.number} onChange={s("number")} /></Field>
      <Field label="Tipo (ex.: RCTR-C, RC-DC)"><Input value={v.kind} onChange={s("kind")} /></Field>
      <Field label="Coberturas"><Input value={v.coverage} onChange={s("coverage")} /></Field>
      <Field label="Limite por embarque (R$)"><Input inputMode="decimal" value={v.limit_value} onChange={s("limit_value")} /></Field>
      <Field label="Franquia (R$)"><Input inputMode="decimal" value={v.deductible} onChange={s("deductible")} /></Field>
      <Field label="Início da vigência"><Input type="date" value={v.valid_from} onChange={s("valid_from")} /></Field>
      <Field label="Fim da vigência"><Input type="date" value={v.valid_to} onChange={s("valid_to")} /></Field>
      <Field label="Tipos de mercadoria cobertos"><Input value={v.cargo_types} onChange={s("cargo_types")} /></Field>
      <Field label="Regras de gerenciamento de risco"><Input value={v.risk_rules} onChange={s("risk_rules")} /></Field>
      <div className="sm:col-span-2"><FileField label="Arquivo da apólice (PDF)" orgId={orgId} folder="apolices" value={file} onChange={setFile} /></div>
      <div className="sm:col-span-2"><Field label="Observações"><Textarea value={v.notes} onChange={s("notes")} /></Field></div>
      <div className="flex gap-3 sm:col-span-2"><Button type="submit">Salvar</Button><Button variant="ghost" onClick={onCancel}>Cancelar</Button></div></form></Card>
  );
}
