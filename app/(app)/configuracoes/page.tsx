"use client";
import { useState } from "react";
import { useTable } from "@/lib/useTable";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { DEFAULT_ALERTS, DEFAULT_CIOT_RULES, DEFAULT_ETA, type CiotType } from "@/lib/compliance";
import { CIOT_TYPE } from "@/lib/compliance";
import { dateBR, toNumber } from "@/lib/format";
import { Notice, Table, Tabs, Td } from "@/components/extra";
import { Badge, Button, Card, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";

type Rule = { id: string; name: string; regime: string | null; uf_origin: string | null; uf_dest: string | null; service_nature: string | null; taker_type: string | null; base: string; rate_pct: number; retention_pct: number; benefit_note: string | null; reform_note: string | null; validated_by: string | null; valid_from: string | null; valid_to: string | null; version: number; active: boolean };
type Hist = { id: number; action: string; changes: Record<string, { de: unknown; para: unknown }> | null; created_at: string };

export default function ConfiguracoesPage() {
  const { org, reloadOrg } = useAppSession();
  const [tab, setTab] = useState("fiscal");
  return (
    <>
      <PageHeader crumb="Conta" title="Configurações" subtitle="Empresa, regras fiscais, alertas e parâmetros operacionais." />
      <Tabs value={tab} onChange={setTab} items={[{ id: "fiscal", label: "Regras fiscais" }, { id: "alertas", label: "Alertas" }, { id: "ciot", label: "CIOT" }, { id: "entrega", label: "Previsão de entrega" }, { id: "empresa", label: "Dados da empresa" }]} />
      {tab === "fiscal" && <TaxRules />}
      {tab === "empresa" && <Company />}
      {tab === "alertas" && <Settings keyName="alertas" title="Limites dos alertas" fields={[["marginTargetPct", "Meta de margem (%)"], ["costDeviationPct", "Desvio de custo aceito (%)"], ["docWarnDays", "Avisar documentos com quantos dias de antecedência"]]} defaults={DEFAULT_ALERTS as unknown as Record<string, number>} path="alerts" org={org} reload={reloadOrg} />}
      {tab === "entrega" && <Settings keyName="eta" title="Parâmetros da previsão de entrega" note="Valores padrão baseados na leitura usual da lei do motorista profissional (pausa de 30 min a cada 5h30 de direção; 11 h de descanso diário). Confirme com seu jurídico/RH." fields={[["avgSpeedKmh", "Velocidade média (km/h)"], ["maxDriveBlockH", "Direção contínua máxima (h)"], ["breakH", "Pausa (h)"], ["maxDailyDriveH", "Direção máxima por dia (h)"], ["dailyRestH", "Descanso diário (h)"]]} defaults={DEFAULT_ETA as unknown as Record<string, number>} path="eta" org={org} reload={reloadOrg} />}
      {tab === "ciot" && <CiotRulesCard org={org} reload={reloadOrg} />}
    </>
  );
}

function Settings({ title, note, fields, defaults, path, org, reload }: { keyName: string; title: string; note?: string; fields: [string, string][]; defaults: Record<string, number>; path: string; org: ReturnType<typeof useAppSession>["org"]; reload: () => void }) {
  const cur = ((org?.settings as Record<string, Record<string, number>> | undefined)?.[path]) ?? {};
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(fields.map(([k]) => [k, String(cur[k] ?? defaults[k])])));
  const [msg, setMsg] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const val = Object.fromEntries(fields.map(([k]) => [k, toNumber(v[k])]));
    if (Object.values(val).some((n) => n < 0)) return setMsg("Use valores positivos.");
    const { error } = await getSupabase()!.from("orgs").update({ settings: { ...(org?.settings ?? {}), [path]: val } }).eq("id", org!.id);
    setMsg(error ? "Não foi possível salvar." : "Salvo."); if (!error) reload();
  }
  return (
    <Card><form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2">{title}</h2>
      {note && <p className="text-sm text-muted sm:col-span-2">{note}</p>}
      {fields.map(([k, l]) => <Field key={k} label={l}><Input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></Field>)}
      {msg && <p role="status" className="text-sm font-semibold sm:col-span-2">{msg}</p>}
      <div className="sm:col-span-2"><Button type="submit">Salvar</Button></div></form></Card>
  );
}

function CiotRulesCard({ org, reload }: { org: ReturnType<typeof useAppSession>["org"]; reload: () => void }) {
  const cur = ((org?.settings as { ciot?: typeof DEFAULT_CIOT_RULES } | undefined)?.ciot) ?? DEFAULT_CIOT_RULES;
  const [req, setReq] = useState<CiotType[]>(cur.requiredFor);
  const [na, setNa] = useState<CiotType[]>(cur.notApplicableFor);
  const [msg, setMsg] = useState<string | null>(null);
  const toggle = (list: CiotType[], set: (l: CiotType[]) => void, t: CiotType) => set(list.includes(t) ? list.filter((x) => x !== t) : [...list, t]);
  async function save() {
    const { error } = await getSupabase()!.from("orgs").update({ settings: { ...(org?.settings ?? {}), ciot: { requiredFor: req.filter((t) => !na.includes(t)), notApplicableFor: na } } }).eq("id", org!.id);
    setMsg(error ? "Não foi possível salvar." : "Salvo."); if (!error) reload();
  }
  return (
    <Card><h2 className="text-lg font-extrabold text-pine-950">Regras de aplicabilidade do CIOT</h2>
      <p className="mt-1 text-sm text-muted">Defina por tipo de contratado se o CIOT é necessário. O padrão é só uma sugestão de partida: valide com a regulamentação vigente da ANTT e com seu contador.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <fieldset><legend className="font-bold">Exige CIOT</legend>{(Object.keys(CIOT_TYPE) as CiotType[]).map((t) => <label key={t} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={req.includes(t) && !na.includes(t)} onChange={() => { setNa(na.filter((x) => x !== t)); toggle(req, setReq, t); }} />{CIOT_TYPE[t]}</label>)}</fieldset>
        <fieldset><legend className="font-bold">Não exige CIOT</legend>{(Object.keys(CIOT_TYPE) as CiotType[]).map((t) => <label key={t} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-5" checked={na.includes(t)} onChange={() => { setReq(req.filter((x) => x !== t)); toggle(na, setNa, t); }} />{CIOT_TYPE[t]}</label>)}</fieldset>
      </div>
      {msg && <p role="status" className="mt-3 text-sm font-semibold">{msg}</p>}<Button className="mt-4" onClick={save}>Salvar</Button></Card>
  );
}

function Company() {
  const { org, reloadOrg } = useAppSession();
  const [v, setV] = useState({ legal_name: org?.legal_name ?? "", trade_name: org?.trade_name ?? "", cnpj: org?.cnpj ?? "", phone: org?.phone ?? "", email: org?.email ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const cnpj = v.cnpj.replace(/\D/g, "");
    if (cnpj && cnpj.length !== 14) return setMsg("CNPJ deve ter 14 dígitos.");
    const { error } = await getSupabase()!.from("orgs").update({ legal_name: v.legal_name || null, trade_name: v.trade_name || null, name: v.trade_name || v.legal_name || org!.name, cnpj: cnpj || null, phone: v.phone || null, email: v.email || null }).eq("id", org!.id);
    setMsg(error ? "Não foi possível salvar." : "Dados salvos."); if (!error) reloadOrg();
  }
  return (
    <Card><form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2">Dados da transportadora</h2>
      <Field label="Razão social"><Input value={v.legal_name} onChange={(e) => setV({ ...v, legal_name: e.target.value })} /></Field>
      <Field label="Nome fantasia"><Input value={v.trade_name} onChange={(e) => setV({ ...v, trade_name: e.target.value })} /></Field>
      <Field label="CNPJ"><Input inputMode="numeric" value={v.cnpj} onChange={(e) => setV({ ...v, cnpj: e.target.value })} /></Field>
      <Field label="Telefone"><Input value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} /></Field>
      <Field label="E-mail de contato"><Input type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></Field>
      <p className="self-end text-sm text-muted">Plano: <b>{org?.plan?.name ?? "—"}</b> · Situação: <b>{org?.status}</b>. Plano e situação só são alterados pela NicoTech.</p>
      {msg && <p role="status" className="text-sm font-semibold sm:col-span-2">{msg}</p>}<div className="sm:col-span-2"><Button type="submit">Salvar</Button></div></form></Card>
  );
}

function TaxRules() {
  const rules = useTable<Rule>("tax_rules");
  const [edit, setEdit] = useState<Rule | "new" | null>(null);
  const [hist, setHist] = useState<{ id: string; rows: Hist[] } | null>(null);
  async function showHist(r: Rule) {
    const { data } = await getSupabase()!.from("audit_log").select("id, action, changes, created_at").eq("table_name", "tax_rules").eq("record_id", r.id).order("created_at", { ascending: false }).limit(20);
    setHist({ id: r.id, rows: (data ?? []) as Hist[] });
  }
  return (
    <>
      <Notice tone="warn">Não existe alíquota universal. Cadastre cada regra com UF, base, vigência e quem validou. <b>As regras devem ser validadas por contador/profissional habilitado antes do uso em produção.</b> O simulador usa a regra vigente mais específica e guarda a versão usada em cada cotação. A base é o valor do frete (serviço), nunca o valor da mercadoria. Os parâmetros da reforma tributária ficam em campo de anotação até que as regras de transição sejam definidas por você.</Notice>
      {!edit && <Button className="mb-5" onClick={() => setEdit("new")}>Nova regra</Button>}
      {edit && <RuleForm rule={edit === "new" ? undefined : edit} onDone={() => { setEdit(null); rules.reload(); }} onCancel={() => setEdit(null)} />}
      {rules.loading ? <Loading /> : rules.rows.length === 0 ? <p className="text-muted">Nenhuma regra cadastrada. Sem regra, o simulador usa a alíquota digitada manualmente, sem versão.</p> : (
        <Table head={["Regra", "Rota", "Base / alíquota", "Vigência", "Versão", ""]}>
          {rules.rows.map((r) => (
            <tr key={r.id}><Td><b>{r.name}</b><p className="text-xs text-muted">{r.regime} {r.service_nature}</p>{!r.validated_by && <Badge tone="warn">Não validada</Badge>}{r.validated_by && <p className="text-xs text-green-800">Validada por {r.validated_by}</p>}</Td>
              <Td>{r.uf_origin ?? "Qualquer"} → {r.uf_dest ?? "Qualquer"}</Td><Td>{r.base === "valor_frete" ? "Frete" : "Frete − pedágio"} · {r.rate_pct}%{r.retention_pct ? ` · retenção ${r.retention_pct}%` : ""}</Td>
              <Td>{dateBR(r.valid_from)} a {dateBR(r.valid_to)}{!r.active && <Badge tone="neutral">Inativa</Badge>}</Td><Td>v{r.version}</Td>
              <Td><div className="flex gap-2"><Button variant="ghost" onClick={() => setEdit(r)}>Editar</Button><Button variant="ghost" onClick={() => showHist(r)}>Histórico</Button></div>
                {hist?.id === r.id && <ul className="mt-2 space-y-1 text-xs">{hist.rows.map((h) => <li key={h.id}>{new Date(h.created_at).toLocaleString("pt-BR")} — {h.action === "insert" ? "criada" : h.action === "delete" ? "excluída" : Object.entries(h.changes ?? {}).filter(([k]) => k !== "version").map(([k, c]) => `${k}: ${String(c.de)} → ${String(c.para)}`).join("; ")}</li>)}</ul>}</Td></tr>
          ))}
        </Table>
      )}
    </>
  );
}

function RuleForm({ rule, onDone, onCancel }: { rule?: Rule; onDone: () => void; onCancel: () => void }) {
  const [v, setV] = useState({ name: rule?.name ?? "", regime: rule?.regime ?? "", uf_origin: rule?.uf_origin ?? "", uf_dest: rule?.uf_dest ?? "", service_nature: rule?.service_nature ?? "", taker_type: rule?.taker_type ?? "", base: rule?.base ?? "valor_frete", rate_pct: rule ? String(rule.rate_pct) : "", retention_pct: rule ? String(rule.retention_pct) : "0", benefit_note: rule?.benefit_note ?? "", reform_note: rule?.reform_note ?? "", validated_by: rule?.validated_by ?? "", valid_from: rule?.valid_from ?? "", valid_to: rule?.valid_to ?? "", active: rule?.active ?? true });
  const [err, setErr] = useState<string | null>(null);
  const s = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const row = { ...v, uf_origin: v.uf_origin.toUpperCase() || null, uf_dest: v.uf_dest.toUpperCase() || null, rate_pct: toNumber(v.rate_pct), retention_pct: toNumber(v.retention_pct), valid_from: v.valid_from || null, valid_to: v.valid_to || null, validated_by: v.validated_by || null, benefit_note: v.benefit_note || null, reform_note: v.reform_note || null, regime: v.regime || null, service_nature: v.service_nature || null, taker_type: v.taker_type || null };
    const sb = getSupabase()!;
    const { error } = rule ? await sb.from("tax_rules").update(row).eq("id", rule.id) : await sb.from("tax_rules").insert(row);
    if (error) return setErr("Não foi possível salvar. Confira UF (2 letras) e percentuais entre 0 e 100.");
    onDone();
  }
  return (
    <Card className="mb-6"><form onSubmit={save} className="grid gap-4 sm:grid-cols-2"><h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2">{rule ? `Editar regra (v${rule.version})` : "Nova regra fiscal"}</h2>
      <Field label="Nome"><Input required value={v.name} onChange={s("name")} /></Field><Field label="Regime tributário"><Input value={v.regime} onChange={s("regime")} /></Field>
      <Field label="UF de origem (vazio = qualquer)"><Input maxLength={2} value={v.uf_origin} onChange={s("uf_origin")} /></Field><Field label="UF de destino (vazio = qualquer)"><Input maxLength={2} value={v.uf_dest} onChange={s("uf_dest")} /></Field>
      <Field label="Natureza da prestação"><Input value={v.service_nature} onChange={s("service_nature")} /></Field><Field label="Tipo de tomador"><Input value={v.taker_type} onChange={s("taker_type")} /></Field>
      <Field label="Base de cálculo"><Select value={v.base} onChange={s("base")}><option value="valor_frete">Valor do frete</option><option value="valor_frete_menos_pedagio">Frete menos pedágio</option></Select></Field>
      <Field label="Alíquota (%)"><Input required inputMode="decimal" value={v.rate_pct} onChange={s("rate_pct")} /></Field><Field label="Retenção (%)"><Input inputMode="decimal" value={v.retention_pct} onChange={s("retention_pct")} /></Field>
      <Field label="Vigência de"><Input type="date" value={v.valid_from} onChange={s("valid_from")} /></Field><Field label="Vigência até"><Input type="date" value={v.valid_to} onChange={s("valid_to")} /></Field>
      <Field label="Validada por (contador/profissional)"><Input value={v.validated_by} onChange={s("validated_by")} /></Field>
      <label className="flex min-h-11 items-center gap-3 self-end text-sm font-semibold"><input type="checkbox" className="size-5" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Regra ativa</label>
      <div className="sm:col-span-2"><Field label="Benefícios fiscais"><Textarea value={v.benefit_note} onChange={s("benefit_note")} /></Field></div>
      <div className="sm:col-span-2"><Field label="Transição da reforma tributária (anotações)"><Textarea value={v.reform_note} onChange={s("reform_note")} /></Field></div>
      {err && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2">{err}</p>}<div className="flex gap-3 sm:col-span-2"><Button type="submit">Salvar</Button><Button variant="ghost" onClick={onCancel}>Cancelar</Button></div></form></Card>
  );
}
