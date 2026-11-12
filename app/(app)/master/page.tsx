"use client";
import { useState } from "react";
import { rpc } from "@/lib/db";
import { useQuery } from "@/lib/useQuery";
import { useAppSession } from "@/lib/session";
import { dateBR, money, toNumber } from "@/lib/format";
import { Notice, Table, Tabs, Td } from "@/components/extra";
import { Badge, Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Stat, Textarea } from "@/components/ui";

type Org = { id: string; name: string; cnpj: string | null; status: string; trial_ends_at: string | null; plan: string | null; price_month: number | null; created_at: string; users: number; vehicles: number; trips: number };
type Plan = { code: string; name: string; price_month: number | null; price_year: number | null; max_users: number | null; max_vehicles: number | null; storage_mb: number | null; ai_queries_month: number | null; features: string[]; active: boolean };
type Req = { id: string; company: string; cnpj: string | null; contact_name: string; email: string; phone: string | null; status: string; created_at: string };
type Ticket = { id: string; org: string; subject: string; priority: string; status: string; assignee: string | null; created_at: string; messages: { author: string; body: string; at: string }[] };
type Overview = { orgs: Org[]; requests: Req[]; plans: Plan[]; payments: { org_id: string | null; provider: string; kind: string; amount: number | null; status: string; occurred_at: string | null }[]; tickets: Ticket[]; audit: { id: number; action: string; target: string | null; details: unknown; created_at: string }[] };
const FEATURES = ["clientes", "viagens", "recebimentos", "dashboard", "simulador", "frota", "motorista", "manutencao", "documentos", "relatorios", "automacoes", "portal_cliente", "integracoes", "bi", "assistente"];

export default function MasterPage() {
  const { org } = useAppSession();
  const q = useQuery(() => rpc<Overview>("master_overview"));
  const [tab, setTab] = useState("empresas");
  const [err, setErr] = useState<string | null>(null);
  if (!org?.superadmin) return null;
  if (q.loading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox message={q.error ?? "Erro"} onRetry={q.reload} />;
  const o = q.data;
  const run = async (fn: string, args: Record<string, unknown>) => { setErr(null); try { await rpc(fn, args); q.reload(); } catch (x) { setErr((x as Error).message); } };
  const price = (code: string | null) => o.plans.find((p) => p.code === code)?.price_month ?? null;
  const active = o.orgs.filter((x) => x.status === "ativa"), trial = o.orgs.filter((x) => x.status === "teste"), susp = o.orgs.filter((x) => x.status === "suspensa");
  const mrr = active.reduce((s, x) => s + Number(price(x.plan) ?? 0), 0);

  return (
    <>
      <PageHeader crumb="NicoTech" title="Painel master" subtitle="Empresas, planos, assinaturas e suporte." />
      <Notice>Este painel mostra apenas dados cadastrais e contagens. <b>Não há acesso a viagens, financeiro ou documentos das transportadoras.</b> Toda alteração fica no registro de auditoria da plataforma. Receita recorrente = soma do preço mensal do plano das empresas ativas (não é cobrança real; pagamentos só entram por webhook verificado).</Notice>
      {err && <p role="alert" className="mb-4 text-sm font-semibold text-danger">{err}</p>}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Transportadoras" value={String(o.orgs.length)} /><Stat label="Ativas" value={String(active.length)} note={`${trial.length} em teste · ${susp.length} suspensas`} /><Stat label="Receita recorrente estimada" value={money(mrr)} note="Planos sem preço contam zero" /><Stat label="Chamados abertos" value={String(o.tickets.filter((t) => t.status !== "resolvido").length)} /></div>
      <Tabs value={tab} onChange={setTab} items={[{ id: "empresas", label: "Empresas" }, { id: "pedidos", label: `Pedidos de cadastro (${o.requests.filter((r) => r.status === "pendente").length})` }, { id: "planos", label: "Planos" }, { id: "pagamentos", label: "Pagamentos" }, { id: "suporte", label: "Suporte" }, { id: "auditoria", label: "Auditoria" }]} />
      {tab === "empresas" && <Table head={["Empresa", "Plano", "Situação", "Uso", ""]}>{o.orgs.map((x) => <OrgRow key={x.id} x={x} plans={o.plans} onSave={(s, p, t) => run("master_set_org", { p_org: x.id, p_status: s, p_plan: p, p_trial: t || null })} />)}</Table>}
      {tab === "pedidos" && (o.requests.length === 0 ? <p className="text-muted">Nenhum pedido.</p> : <Table head={["Data", "Empresa", "Contato", "Situação", ""]}>{o.requests.map((r) => <tr key={r.id}><Td>{dateBR(r.created_at)}</Td><Td><b>{r.company}</b><p className="text-xs text-muted">{r.cnpj}</p></Td><Td>{r.contact_name}<p className="text-xs text-muted">{r.email} {r.phone}</p></Td><Td>{r.status}</Td>
        <Td>{r.status === "pendente" && <div className="flex gap-2"><Button onClick={() => run("master_decide_request", { p_request: r.id, p_approve: true, p_plan: "profissional", p_trial_days: 15 })}>Aprovar (teste 15 dias)</Button><Button variant="danger" onClick={() => run("master_decide_request", { p_request: r.id, p_approve: false, p_plan: "profissional", p_trial_days: 0 })}>Recusar</Button></div>}</Td></tr>)}</Table>)}
      {tab === "planos" && <div className="space-y-4">{o.plans.map((p) => <PlanCard key={p.code} p={p} onSave={(v) => run("master_save_plan", v)} />)}<PlanCard p={{ code: "", name: "", price_month: null, price_year: null, max_users: null, max_vehicles: null, storage_mb: null, ai_queries_month: null, features: [], active: true }} onSave={(v) => run("master_save_plan", v)} isNew /></div>}
      {tab === "pagamentos" && (o.payments.length === 0 ? <Notice tone="warn">Nenhum pagamento registrado. O provedor de pagamentos ainda não está conectado: a rota de webhook existe, mas só processa eventos com assinatura válida quando o segredo for configurado no servidor.</Notice> : <Table head={["Data", "Provedor", "Evento", "Valor", "Situação"]}>{o.payments.map((p, i) => <tr key={i}><Td>{dateBR(p.occurred_at)}</Td><Td>{p.provider}</Td><Td>{p.kind}</Td><Td>{p.amount != null ? money(p.amount) : "—"}</Td><Td>{p.status}</Td></tr>)}</Table>)}
      {tab === "suporte" && (o.tickets.length === 0 ? <p className="text-muted">Nenhum chamado.</p> : <div className="space-y-4">{o.tickets.map((t) => <TicketCard key={t.id} t={t} onSave={(s, a, b) => run("master_reply_ticket", { p_ticket: t.id, p_status: s, p_assignee: a, p_body: b })} />)}</div>)}
      {tab === "auditoria" && <Table head={["Quando", "Ação", "Alvo", "Detalhes"]}>{o.audit.map((a) => <tr key={a.id}><Td>{new Date(a.created_at).toLocaleString("pt-BR")}</Td><Td>{a.action}</Td><Td className="break-all text-xs">{a.target}</Td><Td className="text-xs">{JSON.stringify(a.details)}</Td></tr>)}</Table>}
    </>
  );
}

function OrgRow({ x, plans, onSave }: { x: Org; plans: Plan[]; onSave: (s: string, p: string, t: string) => void }) {
  const [s, setS] = useState(x.status), [p, setP] = useState(x.plan ?? "essencial"), [t, setT] = useState(x.trial_ends_at ?? "");
  const dirty = s !== x.status || p !== (x.plan ?? "essencial") || t !== (x.trial_ends_at ?? "");
  return <tr><Td><b>{x.name}</b><p className="text-xs text-muted">{x.cnpj} · desde {dateBR(x.created_at)}</p></Td>
    <Td><Select aria-label="Plano" value={p} onChange={(e) => setP(e.target.value)}>{plans.map((pl) => <option key={pl.code} value={pl.code}>{pl.name}</option>)}</Select></Td>
    <Td><Select aria-label="Situação" value={s} onChange={(e) => setS(e.target.value)}><option value="teste">Em teste</option><option value="ativa">Ativa</option><option value="suspensa">Suspensa</option><option value="cancelada">Cancelada</option></Select><Input aria-label="Fim do teste" type="date" className="mt-2" value={t} onChange={(e) => setT(e.target.value)} /></Td>
    <Td className="text-xs">{x.users} usuário(s)<br />{x.vehicles} veículo(s)<br />{x.trips} viagem(ns)</Td><Td><Button variant="ghost" disabled={!dirty} onClick={() => confirm(`Alterar ${x.name}? A alteração será registrada na auditoria.`) && onSave(s, p, t)}>Salvar</Button></Td></tr>;
}

function PlanCard({ p, onSave, isNew }: { p: Plan; onSave: (v: Record<string, unknown>) => void; isNew?: boolean }) {
  const [v, setV] = useState({ code: p.code, name: p.name, m: p.price_month?.toString() ?? "", y: p.price_year?.toString() ?? "", u: p.max_users?.toString() ?? "", ve: p.max_vehicles?.toString() ?? "", st: p.storage_mb?.toString() ?? "", ai: p.ai_queries_month?.toString() ?? "", f: p.features, a: p.active });
  const n = (x: string) => (x.trim() === "" ? null : toNumber(x));
  return <Card><h2 className="font-extrabold text-pine-950">{isNew ? "Novo plano" : p.name}</h2>
    <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
      <Field label="Código"><Input disabled={!isNew} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value })} /></Field><Field label="Nome"><Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field>
      <Field label="Preço mensal (R$)"><Input inputMode="decimal" value={v.m} onChange={(e) => setV({ ...v, m: e.target.value })} /></Field><Field label="Preço anual (R$)"><Input inputMode="decimal" value={v.y} onChange={(e) => setV({ ...v, y: e.target.value })} /></Field>
      <Field label="Usuários (vazio = ilimitado)"><Input inputMode="numeric" value={v.u} onChange={(e) => setV({ ...v, u: e.target.value })} /></Field><Field label="Veículos"><Input inputMode="numeric" value={v.ve} onChange={(e) => setV({ ...v, ve: e.target.value })} /></Field>
      <Field label="Armazenamento (MB)"><Input inputMode="numeric" value={v.st} onChange={(e) => setV({ ...v, st: e.target.value })} /></Field><Field label="Consultas de IA/mês"><Input inputMode="numeric" value={v.ai} onChange={(e) => setV({ ...v, ai: e.target.value })} /></Field></div>
    <fieldset className="mt-3"><legend className="text-sm font-bold">Recursos</legend><div className="flex flex-wrap gap-x-4">{FEATURES.map((f) => <label key={f} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="size-5" checked={v.f.includes(f)} onChange={() => setV({ ...v, f: v.f.includes(f) ? v.f.filter((x) => x !== f) : [...v.f, f] })} />{f}</label>)}</div></fieldset>
    <p className="mt-2 text-xs text-muted">Limites de usuários, veículos e consultas de IA são aplicados pelo banco. Os recursos só organizam o menu. Preços em branco = ainda não definidos.</p>
    <Button className="mt-3" disabled={!v.code || !v.name} onClick={() => onSave({ p_code: v.code, p_name: v.name, p_price_month: n(v.m), p_price_year: n(v.y), p_max_users: n(v.u), p_max_vehicles: n(v.ve), p_storage_mb: n(v.st), p_ai: n(v.ai), p_features: v.f, p_active: v.a })}>Salvar plano</Button></Card>;
}

function TicketCard({ t, onSave }: { t: Ticket; onSave: (s: string, a: string, b: string) => void }) {
  const [s, setS] = useState(t.status), [a, setA] = useState(t.assignee ?? ""), [b, setB] = useState("");
  return <Card><div className="flex flex-wrap items-center gap-2"><Badge tone={t.status === "resolvido" ? "good" : "warn"}>{t.status}</Badge><b>{t.subject}</b><span className="text-xs text-muted">{t.org} · {t.priority} · {dateBR(t.created_at)}</span></div>
    <ul className="mt-3 space-y-2 text-sm">{t.messages.map((m, i) => <li key={i} className={m.author === "nicotech" ? "rounded-xl bg-paper p-2" : ""}><b>{m.author === "nicotech" ? "NicoTech" : "Empresa"}:</b> {m.body}</li>)}</ul>
    <div className="mt-3 grid gap-3 sm:grid-cols-3"><Field label="Situação"><Select value={s} onChange={(e) => setS(e.target.value)}><option value="aberto">Aberto</option><option value="em_atendimento">Em atendimento</option><option value="resolvido">Resolvido</option></Select></Field><Field label="Responsável"><Input value={a} onChange={(e) => setA(e.target.value)} /></Field></div>
    <div className="mt-3"><Field label="Resposta"><Textarea value={b} onChange={(e) => setB(e.target.value)} maxLength={3000} /></Field></div><Button className="mt-3" onClick={() => { onSave(s, a, b); setB(""); }}>Salvar</Button></Card>;
}
