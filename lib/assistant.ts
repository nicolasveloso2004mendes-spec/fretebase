import { groupBy, inPeriod, overdueByClient, routeKey, summarize, tripNumbers, type BiExpense, type BiTrip } from "./bi";
import { expiryState, maintenanceAlerts, type Maint } from "./fleet";

/**
 * Fretebase AI — consultas determinísticas.
 * Não há modelo de linguagem conectado: a pergunta é classificada por palavras-chave e respondida
 * com cálculos sobre os dados que o usuário já tem permissão de ler (a RLS do banco filtra antes).
 * O texto da pergunta e o conteúdo de documentos nunca são executados nem alteram permissões.
 */
export type AssistantData = {
  today: string;
  trips: BiTrip[];
  expenses: BiExpense[];
  clients: { id: string; name: string }[];
  vehicles: { id: string; name: string; plate: string | null; odometer_km: number }[];
  drivers: { id: string; name: string; cnh_expiry: string | null }[];
  maintenance: (Maint & { parts_cost: number; labor_cost: number })[];
  vehicleDocs: { vehicle_id: string; kind: string; expires_on: string | null }[];
  policies: { number: string; valid_to: string | null }[];
};
export type Answer = { intent: string; answered: boolean; period: string; text: string; calc: string; links: { href: string; label: string }[] };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const br = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4);

export function periodFor(question: string, today: string): { from: string; to: string; label: string } {
  const q = norm(question);
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  const pad = (n: number) => String(n).padStart(2, "0");
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (/mes passado|ultimo mes/.test(q)) {
    const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last(py, pm))}`, label: `mês passado (${pad(pm)}/${py})` };
  }
  if (/este ano|neste ano|no ano|anual/.test(q)) return { from: `${y}-01-01`, to: today, label: `ano de ${y} até ${br(today)}` };
  if (/sempre|todo o periodo|historico|ate hoje/.test(q)) return { from: "1900-01-01", to: "2999-12-31", label: "todo o histórico" };
  return { from: `${y}-${pad(m)}-01`, to: today, label: `mês atual (01/${pad(m)}/${y} a ${br(today)})` };
}

const INTENTS: { id: string; re: RegExp }[] = [
  { id: "inadimplentes", re: /inadimpl|devendo|atrasad[oa]s? no pagamento|nao pag|receb\w* vencid|em aberto/ },
  { id: "prejuizo", re: /prejuiz|deram? negativ|perd\w+ dinheiro/ },
  { id: "veiculo_despesa", re: /(caminhao|veiculo|carreta).*(despesa|gast|custo)|(despesa|gast|custo).*(caminhao|veiculo)/ },
  { id: "motorista_entregas", re: /motorista.*(entreg|viage)|(entreg|viage).*motorista/ },
  { id: "rota_rentavel", re: /rota.*(rentab|lucr|melhor)|(rentab|lucr).*rota/ },
  { id: "cliente_rentavel", re: /cliente.*(rentab|lucr|melhor)|(rentab|lucr).*cliente/ },
  { id: "manutencao", re: /manutenc|revisao|troca de oleo/ },
  { id: "documentos", re: /document|vencend|vence|cnh|apolice|seguro/ },
  { id: "quanto_cobrar", re: /quanto (devo )?cobr|preco do frete|valor do frete/ },
  { id: "lucro", re: /lucr|sobr|margem|resultado/ },
  { id: "faturamento", re: /fatur|receita|quanto (minha|a) transportadora|quanto entrou|vendi/ },
];

export function classify(question: string) {
  const q = norm(question);
  return INTENTS.find((i) => i.re.test(q))?.id ?? "desconhecida";
}

export function answer(question: string, d: AssistantData): Answer {
  const intent = classify(question);
  const p = periodFor(question, d.today);
  const trips = inPeriod(d.trips, p.from, p.to);
  const none = (text: string, calc = ""): Answer => ({ intent, answered: false, period: p.label, text, calc, links: [] });
  const nameOf = (list: { id: string; name: string }[], id: string) => list.find((x) => x.id === id)?.name ?? "Sem cadastro";

  switch (intent) {
    case "faturamento": {
      if (!trips.length) return none("Não há viagens registradas nesse período, então não há faturamento para calcular.");
      const s = summarize(trips, d.expenses);
      return { intent, answered: true, period: p.label, text: `O faturamento foi de ${brl(s.revenue)} em ${s.count} viagem(ns). Frete médio: ${brl(s.avgFreight ?? 0)}.`, calc: "Soma do valor do frete das viagens não canceladas, pela data de entrega (ou de coleta, quando ainda não entregue).", links: [{ href: "/viagens", label: "Ver viagens" }, { href: "/inteligencia", label: "Abrir indicadores" }] };
    }
    case "lucro": {
      if (!trips.length) return none("Não há viagens nesse período para calcular o resultado.");
      const s = summarize(trips, d.expenses);
      const warn = s.plannedOnly ? ` Atenção: ${s.plannedOnly} viagem(ns) ainda sem despesas lançadas usam o custo previsto.` : "";
      return { intent, answered: true, period: p.label, text: `Resultado de ${brl(s.profit)} sobre ${brl(s.revenue)} de frete${s.marginPct !== null ? ` (margem de ${s.marginPct.toFixed(1)}%)` : ""}.${warn}`, calc: "Frete − custo realizado (ou previsto, quando não há despesas lançadas) − impostos previstos.", links: [{ href: "/inteligencia", label: "Abrir indicadores" }] };
    }
    case "prejuizo": {
      const loss = trips.map((t) => ({ t, n: tripNumbers(t, d.expenses) })).filter((x) => x.n.profit < 0).sort((a, b) => a.n.profit - b.n.profit);
      if (!trips.length) return none("Não há viagens nesse período.");
      if (!loss.length) return { intent, answered: true, period: p.label, text: `Nenhuma das ${trips.length} viagens do período deu prejuízo.`, calc: "Frete − custo − impostos previstos, por viagem.", links: [] };
      return { intent, answered: true, period: p.label, text: `${loss.length} viagem(ns) com prejuízo: ` + loss.slice(0, 5).map((x) => `${routeKey(x.t)} (${brl(x.n.profit)})`).join("; ") + ".", calc: "Frete − custo realizado (ou previsto) − impostos previstos, por viagem.", links: loss.slice(0, 5).map((x) => ({ href: `/viagens/${x.t.id}`, label: routeKey(x.t) })) };
    }
    case "inadimplentes": {
      const o = overdueByClient(d.trips, d.today);
      if (!o.length) return { intent, answered: true, period: `posição em ${br(d.today)}`, text: "Não há recebimentos vencidos em aberto.", calc: "Viagens com pagamento pendente e vencimento anterior a hoje.", links: [] };
      return { intent, answered: true, period: `posição em ${br(d.today)}`, text: o.slice(0, 5).map((x) => `${nameOf(d.clients, x.client_id)}: ${brl(x.total)} em ${x.count} viagem(ns), mais antigo de ${br(x.oldest)}`).join("; ") + ".", calc: "Soma do frete das viagens com pagamento pendente e vencimento anterior a hoje, por cliente.", links: [{ href: "/viagens", label: "Ver recebimentos" }] };
    }
    case "veiculo_despesa": {
      const ids = new Set(trips.map((t) => t.id));
      const byV = new Map<string, number>();
      for (const t of trips) if (t.vehicle_id) byV.set(t.vehicle_id, (byV.get(t.vehicle_id) ?? 0) + d.expenses.filter((e) => e.trip_id === t.id && ids.has(e.trip_id)).reduce((s, e) => s + Number(e.amount), 0));
      for (const m of d.maintenance) if (m.status === "concluida" && m.done_date && m.done_date >= p.from && m.done_date <= p.to) byV.set(m.vehicle_id, (byV.get(m.vehicle_id) ?? 0) + Number(m.parts_cost) + Number(m.labor_cost));
      const rank = [...byV.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
      if (!rank.length) return none("Não há despesas de viagem nem manutenções lançadas nesse período.");
      const v = d.vehicles.find((x) => x.id === rank[0][0]);
      return { intent, answered: true, period: p.label, text: `${v ? `${v.name}${v.plate ? ` (${v.plate})` : ""}` : "Veículo"} teve mais despesas: ${brl(rank[0][1])}.` + (rank.length > 1 ? ` Em seguida: ${rank.slice(1, 4).map(([id, val]) => `${nameOf(d.vehicles, id)} ${brl(val)}`).join("; ")}.` : ""), calc: "Despesas lançadas nas viagens do veículo + manutenções concluídas no período.", links: v ? [{ href: `/veiculos/${v.id}`, label: v.name }] : [] };
    }
    case "motorista_entregas": {
      const done = trips.filter((t) => t.status === "entregue" && t.driver_id);
      if (!done.length) return none("Não há entregas concluídas com motorista atribuído nesse período.");
      const m = new Map<string, number>();
      for (const t of done) m.set(t.driver_id!, (m.get(t.driver_id!) ?? 0) + 1);
      const rank = [...m.entries()].sort((a, b) => b[1] - a[1]);
      return { intent, answered: true, period: p.label, text: rank.slice(0, 5).map(([id, n]) => `${nameOf(d.drivers, id)}: ${n} entrega(s)`).join("; ") + ".", calc: "Contagem de viagens entregues por motorista.", links: [{ href: "/equipe", label: "Ver motoristas" }] };
    }
    case "rota_rentavel":
    case "cliente_rentavel": {
      if (!trips.length) return none("Não há viagens nesse período.");
      const rows = intent === "rota_rentavel" ? groupBy(trips, d.expenses, routeKey, (k) => k) : groupBy(trips, d.expenses, (t) => t.client_id, (k) => nameOf(d.clients, k));
      return { intent, answered: true, period: p.label, text: rows.slice(0, 5).map((r) => `${r.label}: resultado ${brl(r.profit)} em ${r.count} viagem(ns)${r.marginPct !== null ? `, margem ${r.marginPct.toFixed(1)}%` : ""}`).join("; ") + ".", calc: "Resultado = frete − custo realizado (ou previsto) − impostos previstos, agrupado e ordenado do maior para o menor.", links: [{ href: "/inteligencia", label: "Abrir indicadores" }] };
    }
    case "manutencao": {
      const odo = Object.fromEntries(d.vehicles.map((v) => [v.id, Number(v.odometer_km)]));
      const al = maintenanceAlerts(d.maintenance, odo, d.today);
      if (!al.length) return { intent, answered: true, period: `posição em ${br(d.today)}`, text: "Nenhum veículo com manutenção vencida ou próxima, pelos registros cadastrados.", calc: "Última manutenção de cada tipo por veículo, comparada com a data e o km da próxima.", links: [{ href: "/manutencao", label: "Manutenção" }] };
      return { intent, answered: true, period: `posição em ${br(d.today)}`, text: al.slice(0, 6).map((a) => `${nameOf(d.vehicles, a.vehicle_id)}: ${a.reason}`).join("; ") + ".", calc: "Última manutenção de cada tipo por veículo, comparada com a data e o km da próxima.", links: al.slice(0, 4).map((a) => ({ href: `/veiculos/${a.vehicle_id}`, label: nameOf(d.vehicles, a.vehicle_id) })) };
    }
    case "documentos": {
      const items: string[] = [];
      for (const v of d.vehicleDocs) { const s = expiryState(v.expires_on, d.today); if (s === "vencido" || s === "vencendo") items.push(`${v.kind} de ${nameOf(d.vehicles, v.vehicle_id)}: ${s === "vencido" ? "venceu" : "vence"} em ${br(v.expires_on!)}`); }
      for (const dr of d.drivers) { const s = expiryState(dr.cnh_expiry, d.today); if (s === "vencido" || s === "vencendo") items.push(`CNH de ${dr.name}: ${s === "vencido" ? "venceu" : "vence"} em ${br(dr.cnh_expiry!)}`); }
      for (const po of d.policies) { const s = expiryState(po.valid_to, d.today); if (s === "vencido" || s === "vencendo") items.push(`Apólice ${po.number}: ${s === "vencido" ? "venceu" : "vence"} em ${br(po.valid_to!)}`); }
      return { intent, answered: true, period: `próximos 30 dias a partir de ${br(d.today)}`, text: items.length ? items.slice(0, 8).join("; ") + "." : "Nenhum documento vencido ou vencendo nos próximos 30 dias, pelos cadastros.", calc: "Datas de vencimento de documentos de veículos, CNHs e apólices.", links: [{ href: "/conformidade", label: "Conformidade" }] };
    }
    case "quanto_cobrar":
      return { intent, answered: false, period: "—", text: "O preço depende de distância, consumo, pedágios, motorista, impostos e margem. Use o simulador: ele calcula o custo e sugere o frete mínimo para a margem que você definir.", calc: "Não calculo um preço sem os dados da viagem.", links: [{ href: "/cotacoes/nova", label: "Abrir o simulador" }] };
    default:
      return none("Não entendi a pergunta. Posso responder sobre faturamento, resultado, viagens com prejuízo, inadimplentes, despesas por veículo, entregas por motorista, rotas e clientes mais rentáveis, manutenção e documentos vencendo.");
  }
}
