"use client";
import { useMemo, useState } from "react";
import { fetchAll, download, logEvent } from "@/lib/db";
import { useQuery } from "@/lib/useQuery";
import { change, groupBy, inPeriod, monthly, overdueByClient, previousPeriod, routeKey, summarize, toCsv, type BiExpense, type BiTrip } from "@/lib/bi";
import { dateBR, money, pct, today } from "@/lib/format";
import { Bars, Notice, Table, Tabs, Td } from "@/components/extra";
import { Button, Card, ErrorBox, Field, Input, Loading, PageHeader, Select, Stat } from "@/components/ui";

export default function InteligenciaPage() {
  const t0 = today();
  const [from, setFrom] = useState(t0.slice(0, 8) + "01");
  const [to, setTo] = useState(t0);
  const [fClient, setFClient] = useState("");
  const [fVeh, setFVeh] = useState("");
  const [tab, setTab] = useState("resumo");
  const q = useQuery(async () => {
    const [trips, expenses, clients, vehicles, drivers, maint] = await Promise.all([
      fetchAll<BiTrip>("trips"), fetchAll<BiExpense>("trip_expenses", "trip_id, kind, amount"), fetchAll<{ id: string; name: string }>("clients", "id, name"),
      fetchAll<{ id: string; name: string; plate: string | null }>("vehicles", "id, name, plate"), fetchAll<{ id: string; name: string }>("drivers", "id, name"),
      fetchAll<{ vehicle_id: string; parts_cost: number; labor_cost: number; status: string; done_date: string | null }>("maintenance_records", "vehicle_id, parts_cost, labor_cost, status, done_date"),
    ]);
    return { trips, expenses, clients, vehicles, drivers, maint };
  });
  const d = q.data;
  const calc = useMemo(() => {
    if (!d) return null;
    const flt = (a: string, b: string) => inPeriod(d.trips, a, b).filter((t) => (!fClient || t.client_id === fClient) && (!fVeh || t.vehicle_id === fVeh));
    const cur = flt(from, to), prevP = previousPeriod(from, to), prev = flt(prevP.from, prevP.to);
    const maint = d.maint.filter((m) => m.status === "concluida" && m.done_date && m.done_date >= from && m.done_date <= to && (!fVeh || m.vehicle_id === fVeh)).reduce((s, m) => s + Number(m.parts_cost) + Number(m.labor_cost), 0);
    const name = (list: { id: string; name: string }[]) => (k: string) => list.find((x) => x.id === k)?.name ?? "Sem cadastro";
    return {
      cur, s: summarize(cur, d.expenses), p: summarize(prev, d.expenses), prevP, maint,
      byClient: groupBy(cur, d.expenses, (t) => t.client_id, name(d.clients)), byVeh: groupBy(cur, d.expenses, (t) => t.vehicle_id, (k) => { const v = d.vehicles.find((x) => x.id === k); return v ? `${v.name} ${v.plate ?? ""}` : "Sem cadastro"; }),
      byRoute: groupBy(cur, d.expenses, routeKey, (k) => k), months: monthly(d.trips.filter((t) => (!fClient || t.client_id === fClient) && (!fVeh || t.vehicle_id === fVeh)), d.expenses).slice(-12),
      overdue: overdueByClient(d.trips, t0), loss: cur.filter((t) => summarize([t], d.expenses).profit < 0),
    };
  }, [d, from, to, fClient, fVeh, t0]);

  if (q.loading) return <Loading />;
  if (q.error || !d || !calc) return <ErrorBox message={q.error ?? "Erro"} onRetry={q.reload} />;
  const { s, p } = calc;
  const delta = (a: number, b: number) => { const c = change(a, b); return c === null ? "sem base de comparação" : `${c >= 0 ? "+" : ""}${c.toFixed(1)}% vs período anterior`; };
  const cname = (id: string | null) => d.clients.find((c) => c.id === id)?.name ?? "Sem cadastro";

  function exportCsv() {
    const rows = calc!.cur.map((t) => { const n = summarize([t], d!.expenses); return [dateBR(t.delivered_at ?? t.pickup_date ?? t.created_at), t.origin, t.destination, cname(t.client_id), t.status, t.freight_value, n.cost, t.tax_value, n.profit, n.plannedOnly ? "previsto" : "realizado"]; });
    download(`fretebase-viagens-${from}-a-${to}.csv`, toCsv(["Data", "Origem", "Destino", "Cliente", "Situação", "Frete", "Custo", "Impostos", "Resultado", "Base do custo"], rows));
    logEvent("exportacao", `viagens ${from} a ${to}`);
  }

  return (
    <>
      <PageHeader crumb="Gestão" title="Inteligência de negócios" subtitle="Indicadores calculados a partir dos seus registros reais."
        action={<div className="no-print flex gap-2"><Button variant="ghost" onClick={exportCsv}>Exportar CSV</Button><Button variant="ghost" onClick={() => { logEvent("exportacao", "pdf (impressão)"); window.print(); }}>Salvar como PDF</Button></div>} />
      <Card className="no-print mb-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="De"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="Até"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <Field label="Cliente"><Select value={fClient} onChange={(e) => setFClient(e.target.value)}><option value="">Todos</option>{d.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Veículo"><Select value={fVeh} onChange={(e) => setFVeh(e.target.value)}><option value="">Todos</option>{d.vehicles.map((v) => <option key={v.id} value={v.id}>{v.name} {v.plate}</option>)}</Select></Field></div></Card>
      <p className="mb-4 text-sm text-muted">Período: {dateBR(from)} a {dateBR(to)} · comparação com {dateBR(calc.prevP.from)} a {dateBR(calc.prevP.to)}. {s.count} viagem(ns) não canceladas, pela data de entrega (ou coleta).</p>
      {s.plannedOnly > 0 && <Notice tone="warn">{s.plannedOnly} de {s.count} viagem(ns) ainda não têm despesas lançadas: o custo delas é o <b>previsto</b>. O resultado é parcial até lançar os custos reais.</Notice>}
      {s.count === 0 ? <Notice>Sem viagens no período selecionado: não há indicadores para calcular.</Notice> : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Receita (frete)" value={money(s.revenue)} note={delta(s.revenue, p.revenue)} /><Stat label="Lucro operacional" value={money(s.profit)} note={delta(s.profit, p.profit)} />
          <Stat label="Margem média" value={s.marginPct === null ? "—" : pct(s.marginPct)} note={p.marginPct === null ? "sem base de comparação" : `anterior ${pct(p.marginPct)}`} /><Stat label="Frete médio" value={s.avgFreight === null ? "—" : money(s.avgFreight)} note={delta(s.avgFreight ?? 0, p.avgFreight ?? 0)} />
          <Stat label="Custo por km" value={s.costPerKm === null ? "—" : money(s.costPerKm)} note={s.km ? `${Math.round(s.km)} km com distância informada` : "sem distância informada"} /><Stat label="Combustível" value={money(s.fuel)} note="despesas lançadas" />
          <Stat label="Manutenção" value={money(calc.maint)} note="concluídas no período" /><Stat label="Entregas no prazo" value={s.onTimeRate === null ? "—" : pct(s.onTimeRate)} note={s.onTimeBase ? `de ${s.onTimeBase} com previsão e entrega` : "sem previsão registrada"} />
        </div>)}
      <Tabs value={tab} onChange={setTab} items={[{ id: "resumo", label: "Evolução mensal" }, { id: "cliente", label: "Por cliente" }, { id: "veiculo", label: "Por veículo" }, { id: "rota", label: "Por rota" }, { id: "inad", label: "Inadimplência" }, { id: "prejuizo", label: `Prejuízo (${calc.loss.length})` }]} />
      {tab === "resumo" && <Card><h2 className="mb-3 font-extrabold text-pine-950">Resultado por mês</h2>{calc.months.length ? <Bars items={calc.months.map((m) => ({ label: m.month.split("-").reverse().join("/"), value: m.profit }))} format={money} /> : <p className="text-muted">Sem dados.</p>}</Card>}
      {tab === "cliente" && <Group rows={calc.byClient} />}{tab === "veiculo" && <Group rows={calc.byVeh} />}{tab === "rota" && <Group rows={calc.byRoute} />}
      {tab === "inad" && (calc.overdue.length ? <Table head={["Cliente", "Em atraso", "Viagens", "Mais antigo"]}>{calc.overdue.map((o) => <tr key={o.client_id}><Td>{cname(o.client_id === "—" ? null : o.client_id)}</Td><Td className="tnum">{money(o.total)}</Td><Td>{o.count}</Td><Td>{dateBR(o.oldest)}</Td></tr>)}</Table> : <p className="text-muted">Nenhum recebimento vencido.</p>)}
      {tab === "prejuizo" && (calc.loss.length ? <Table head={["Rota", "Cliente", "Frete", "Resultado"]}>{calc.loss.map((t) => <tr key={t.id}><Td>{routeKey(t)}</Td><Td>{cname(t.client_id)}</Td><Td className="tnum">{money(t.freight_value)}</Td><Td className="tnum text-danger">{money(summarize([t], d.expenses).profit)}</Td></tr>)}</Table> : <p className="text-muted">Nenhuma viagem com prejuízo no período.</p>)}
      <p className="mt-6 text-xs text-muted">Resultado = frete − custo realizado (ou previsto, quando não há despesas) − impostos previstos. Para PDF, use “Salvar como PDF” na janela de impressão.</p>
    </>
  );
}

function Group({ rows }: { rows: ReturnType<typeof groupBy> }) {
  if (!rows.length) return <p className="text-muted">Sem dados no período.</p>;
  return (<><Card className="mb-4"><Bars items={rows.slice(0, 10).map((r) => ({ label: r.label, value: r.profit }))} format={money} /></Card>
    <Table head={["Nome", "Viagens", "Receita", "Resultado", "Margem"]}>{rows.map((r) => <tr key={r.key}><Td>{r.label}</Td><Td>{r.count}</Td><Td className="tnum">{money(r.revenue)}</Td><Td className={`tnum ${r.profit < 0 ? "text-danger" : ""}`}>{money(r.profit)}</Td><Td>{r.marginPct === null ? "—" : pct(r.marginPct)}</Td></tr>)}</Table></>);
}
