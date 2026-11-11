import { daysUntil, expiryState, maintenanceAlerts, realizedCost, type Maint } from "./fleet";

/* ---------- CIOT ---------- */
export type CiotType = "frota_propria" | "tac" | "tac_equiparado" | "etc" | "ctc" | "outro";
export const CIOT_TYPE: Record<CiotType, string> = {
  frota_propria: "Frota própria (sem contratação de terceiro)",
  tac: "TAC — transportador autônomo",
  tac_equiparado: "TAC-equiparado",
  etc: "ETC — empresa de transporte",
  ctc: "CTC — cooperativa",
  outro: "Outro / não sei",
};
export const CIOT_STATUS: Record<string, string> = {
  aguardando_analise: "Aguardando análise", nao_aplicavel: "Não aplicável", necessario: "Necessário",
  pendente_registro: "Pendente de registro", registrado: "Registrado", falha_integracao: "Falha de integração",
};
/** Regra configurável por empresa. O padrão segue a leitura usual das normas da ANTT e deve ser confirmado por profissional habilitado. */
export type CiotRules = { requiredFor: CiotType[]; notApplicableFor: CiotType[] };
export const DEFAULT_CIOT_RULES: CiotRules = { requiredFor: ["tac", "tac_equiparado"], notApplicableFor: ["frota_propria"] };

export function ciotSuggestion(type: CiotType, rules: CiotRules = DEFAULT_CIOT_RULES): { status: "necessario" | "nao_aplicavel" | "aguardando_analise"; reason: string } {
  if (rules.requiredFor.includes(type)) return { status: "necessario", reason: `Pela regra configurada, a contratação de ${CIOT_TYPE[type]} exige CIOT.` };
  if (rules.notApplicableFor.includes(type)) return { status: "nao_aplicavel", reason: "Pela regra configurada, este tipo de operação não exige CIOT." };
  return { status: "aguardando_analise", reason: "Não há regra configurada para este tipo de contratado. Analise o caso." };
}

/* ---------- Seguro ---------- */
export type Policy = { id: string; number: string; limit_value: number | null; valid_from: string | null; valid_to: string | null; cargo_types: string | null };
export type InsuranceState = "sem_dados" | "sem_apolice" | "vencida" | "acima_do_limite" | "exige_confirmacao";
export type InsuranceCheck = { state: InsuranceState; text: string; policyId?: string };

/** Nunca devolve "coberto": no máximo aponta uma apólice potencialmente aplicável, que exige confirmação com a seguradora. */
export function insuranceCheck(policies: Policy[], cargoValue: number | null | undefined, todayIso: string): InsuranceCheck {
  if (!policies.length) return { state: "sem_apolice", text: "Nenhuma apólice cadastrada." };
  const valid = policies.filter((p) => (!p.valid_from || p.valid_from <= todayIso) && (!p.valid_to || p.valid_to >= todayIso));
  if (!valid.length) return { state: "vencida", text: "Todas as apólices cadastradas estão fora da vigência." };
  if (!cargoValue || cargoValue <= 0) return { state: "sem_dados", text: "Informe o valor da carga para comparar com os limites das apólices." };
  const fits = valid.filter((p) => p.limit_value !== null && Number(p.limit_value) >= cargoValue);
  if (fits.length) {
    const p = fits.sort((a, b) => Number(a.limit_value) - Number(b.limit_value))[0];
    return { state: "exige_confirmacao", policyId: p.id, text: `A apólice ${p.number} está vigente e o limite cadastrado comporta o valor da carga. A cobertura depende das condições contratuais: confirme com a seguradora.` };
  }
  if (valid.some((p) => p.limit_value === null)) return { state: "sem_dados", text: "Há apólice vigente sem limite cadastrado. Não é possível avaliar." };
  return { state: "acima_do_limite", text: "O valor da carga ultrapassa o limite de todas as apólices vigentes." };
}

/* ---------- Pedágio ---------- */
export type Toll = { total_value: number; kind: "estimado" | "confirmado"; paid_by: "transportadora" | "contratante_vale_pedagio" };
export function tollSummary(rows: Toll[]) {
  const sum = (f: (t: Toll) => boolean) => rows.filter(f).reduce((s, t) => s + Number(t.total_value), 0);
  return {
    estimated: sum((t) => t.kind === "estimado"),
    confirmed: sum((t) => t.kind === "confirmado"),
    valePedagio: sum((t) => t.paid_by === "contratante_vale_pedagio"),
    /** Custo real da transportadora: só confirmado e pago por ela (o vale-pedágio do contratante não entra). */
    borne: sum((t) => t.kind === "confirmado" && t.paid_by === "transportadora"),
  };
}

/* ---------- Motor tributário ---------- */
export type TaxRule = {
  id: string; name: string; uf_origin: string | null; uf_dest: string | null; base: "valor_frete" | "valor_frete_menos_pedagio";
  rate_pct: number; retention_pct: number; valid_from: string | null; valid_to: string | null; version: number; active: boolean;
};
/** Escolhe a regra vigente mais específica para a rota. Sem regra, devolve null: não existe alíquota universal. */
export function pickTaxRule(rules: TaxRule[], ufOrigin: string | null, ufDest: string | null, dateIso: string): TaxRule | null {
  const ok = rules.filter(
    (r) => r.active && (!r.valid_from || r.valid_from <= dateIso) && (!r.valid_to || r.valid_to >= dateIso) &&
      (!r.uf_origin || r.uf_origin === ufOrigin) && (!r.uf_dest || r.uf_dest === ufDest),
  );
  const spec = (r: TaxRule) => (r.uf_origin ? 1 : 0) + (r.uf_dest ? 1 : 0);
  return ok.sort((a, b) => spec(b) - spec(a))[0] ?? null;
}
/** A base é sempre o serviço de transporte (frete), nunca o valor da mercadoria. */
export function computeTax(rule: Pick<TaxRule, "base" | "rate_pct" | "retention_pct">, freight: number, tolls = 0) {
  const base = Math.max(0, rule.base === "valor_frete_menos_pedagio" ? freight - tolls : freight);
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return { base: r2(base), tax: r2(base * (Number(rule.rate_pct) / 100)), retention: r2(base * (Number(rule.retention_pct) / 100)) };
}
export const ufOf = (place: string | null | undefined) => {
  const m = (place ?? "").toUpperCase().match(/(?:[/\-,]\s*)([A-Z]{2})\s*$/);
  return m ? m[1] : null;
};

/* ---------- Previsão de entrega ---------- */
export type EtaSettings = { avgSpeedKmh: number; maxDriveBlockH: number; breakH: number; maxDailyDriveH: number; dailyRestH: number };
/** Parâmetros editáveis. O padrão reflete a leitura usual da Lei do Motorista (pausa de 30 min a cada 5h30 e 11 h de descanso diário). */
export const DEFAULT_ETA: EtaSettings = { avgSpeedKmh: 60, maxDriveBlockH: 5.5, breakH: 0.5, maxDailyDriveH: 8, dailyRestH: 11 };

export function estimateEta(args: { distanceKm: number | null | undefined; startedAt: string | null | undefined; settings?: Partial<EtaSettings> }): { eta: Date; driveH: number; totalH: number } | null {
  const s = { ...DEFAULT_ETA, ...args.settings };
  if (!args.distanceKm || args.distanceKm <= 0 || !args.startedAt || !(s.avgSpeedKmh > 0)) return null;
  const start = new Date(args.startedAt);
  if (Number.isNaN(start.getTime())) return null;
  const driveH = args.distanceKm / s.avgSpeedKmh;
  const breaks = Math.max(0, Math.ceil(driveH / s.maxDriveBlockH) - 1) * s.breakH;
  const rests = Math.max(0, Math.ceil(driveH / s.maxDailyDriveH) - 1) * s.dailyRestH;
  const totalH = driveH + breaks + rests;
  return { eta: new Date(start.getTime() + totalH * 3600000), driveH, totalH };
}

/* ---------- Alertas automáticos ---------- */
export type AlertDraft = { kind: string; title: string; description: string; priority: "baixa" | "media" | "alta" | "critica"; ref_path: string | null; action: string; dedupe_key: string; data: Record<string, unknown> };
export type AlertSettings = { marginTargetPct: number; costDeviationPct: number; docWarnDays: number };
export const DEFAULT_ALERTS: AlertSettings = { marginTargetPct: 10, costDeviationPct: 15, docWarnDays: 30 };

export type AlertInput = {
  today: string;
  settings?: Partial<AlertSettings>;
  trips: { id: string; origin: string; destination: string; status: string; delivery_date: string | null; payment_status: string; payment_due: string | null; freight_value: number; planned_cost: number; tax_value: number; driver_id: string | null; vehicle_id: string | null; pickup_date: string | null }[];
  expenses: { trip_id: string; kind: string; amount: number }[];
  fiscal: { id: string; kind: string; trip_id: string | null; status: string; expires_on: string | null; closed_on: string | null; number: string | null }[];
  ciot: { id: string; trip_id: string; status: string }[];
  policies: { id: string; number: string; valid_to: string | null }[];
  vehicleDocs: { id: string; vehicle_id: string; kind: string; expires_on: string | null }[];
  drivers: { id: string; name: string; cnh_expiry: string | null; active: boolean }[];
  maintenance: Maint[];
  odometers: Record<string, number>;
  proofTripIds: string[];
};

export function buildAlerts(i: AlertInput): AlertDraft[] {
  const s = { ...DEFAULT_ALERTS, ...i.settings };
  const out: AlertDraft[] = [];
  const add = (a: AlertDraft) => out.push(a);
  const route = (t: { origin: string; destination: string }) => `${t.origin} → ${t.destination}`;
  const live = i.trips.filter((t) => t.status !== "cancelada");
  const byTrip = (id: string) => i.expenses.filter((e) => e.trip_id === id);

  for (const t of live) {
    const path = `/viagens/${t.id}`;
    const docs = i.fiscal.filter((d) => d.trip_id === t.id);
    if (["em_viagem", "entregue"].includes(t.status) && !docs.some((d) => d.kind === "cte"))
      add({ kind: "cte_pendente", title: "CT-e não vinculado", description: `${route(t)}: a viagem está ${t.status === "entregue" ? "entregue" : "em andamento"} sem CT-e cadastrado.`, priority: "alta", ref_path: path, action: "Cadastre ou importe o XML do CT-e na Central Fiscal e vincule à viagem.", dedupe_key: `cte:${t.id}`, data: { viagem: t.id } });
    if (t.status === "agendada" && (!t.driver_id || !t.vehicle_id))
      add({ kind: "viagem_incompleta", title: "Viagem sem motorista ou veículo", description: `${route(t)}: falta atribuir ${!t.driver_id ? "motorista" : ""}${!t.driver_id && !t.vehicle_id ? " e " : ""}${!t.vehicle_id ? "veículo" : ""}.`, priority: "media", ref_path: path, action: "Abra a viagem e complete os dados.", dedupe_key: `incompleta:${t.id}`, data: {} });
    if (t.status !== "entregue" && t.delivery_date && t.delivery_date < i.today)
      add({ kind: "viagem_atrasada", title: "Viagem atrasada", description: `${route(t)}: entrega prevista para ${t.delivery_date} e ainda não concluída (${daysUntil(t.delivery_date, i.today) * -1} dia(s)).`, priority: "alta", ref_path: path, action: "Fale com o motorista e atualize a previsão.", dedupe_key: `atraso:${t.id}:${t.delivery_date}`, data: { previsto: t.delivery_date } });
    if (t.status === "entregue" && !i.proofTripIds.includes(t.id))
      add({ kind: "entrega_sem_comprovante", title: "Entrega sem comprovante", description: `${route(t)}: entregue sem comprovante registrado.`, priority: "media", ref_path: path, action: "Anexe o comprovante de entrega.", dedupe_key: `semprova:${t.id}`, data: {} });
    if (t.payment_status === "pendente" && t.payment_due && t.payment_due < i.today)
      add({ kind: "recebimento_vencido", title: "Recebimento vencido", description: `${route(t)}: vencimento em ${t.payment_due}, valor ${Number(t.freight_value).toFixed(2)}.`, priority: "alta", ref_path: path, action: "Cobre o cliente e registre o pagamento quando ocorrer.", dedupe_key: `receb:${t.id}:${t.payment_due}`, data: { valor: t.freight_value, vencimento: t.payment_due } });
    const real = realizedCost(byTrip(t.id)).total;
    const planned = Number(t.planned_cost);
    if (planned > 0 && real > planned * (1 + s.costDeviationPct / 100))
      add({ kind: "despesa_acima", title: "Despesa acima do previsto", description: `${route(t)}: custo realizado ${real.toFixed(2)} contra previsto ${planned.toFixed(2)} (limite de ${s.costDeviationPct}%).`, priority: "media", ref_path: path, action: "Revise as despesas lançadas.", dedupe_key: `desvio:${t.id}`, data: { realizado: real, previsto: planned } });
    if (t.status === "entregue" && real > 0) {
      const profit = Number(t.freight_value) - real - Number(t.tax_value);
      const margin = Number(t.freight_value) > 0 ? (profit / Number(t.freight_value)) * 100 : 0;
      if (profit < 0)
        add({ kind: "viagem_prejuizo", title: "Viagem com prejuízo", description: `${route(t)}: frete ${Number(t.freight_value).toFixed(2)}, custo realizado ${real.toFixed(2)}, impostos ${Number(t.tax_value).toFixed(2)} = resultado ${profit.toFixed(2)}.`, priority: "alta", ref_path: path, action: "Reavalie o preço desta rota no simulador.", dedupe_key: `prejuizo:${t.id}`, data: { resultado: profit } });
      else if (margin < s.marginTargetPct)
        add({ kind: "margem_baixa", title: "Margem abaixo da meta", description: `${route(t)}: margem de ${margin.toFixed(1)}% (meta ${s.marginTargetPct}%).`, priority: "baixa", ref_path: path, action: "Compare com a cotação original.", dedupe_key: `margem:${t.id}`, data: { margem: margin } });
    }
  }
  for (const c of i.ciot) if (c.status === "aguardando_analise" || c.status === "pendente_registro" || c.status === "falha_integracao")
    add({ kind: "ciot", title: c.status === "aguardando_analise" ? "CIOT aguardando análise" : c.status === "falha_integracao" ? "CIOT com falha de integração" : "CIOT pendente de registro", description: "Há uma operação com CIOT em aberto.", priority: c.status === "aguardando_analise" ? "media" : "alta", ref_path: "/ciot", action: "Abra o controle de CIOT e conclua a análise.", dedupe_key: `ciot:${c.id}:${c.status}`, data: { viagem: c.trip_id } });
  for (const d of i.fiscal) {
    if (d.kind === "mdfe" && !d.closed_on) {
      const t = i.trips.find((x) => x.id === d.trip_id);
      if (t?.status === "entregue")
        add({ kind: "mdfe_pendente", title: "MDF-e exige atenção", description: `Manifesto ${d.number ?? ""}: a viagem foi entregue e não há data de encerramento registrada.`, priority: "alta", ref_path: "/fiscal", action: "Encerre o MDF-e no emissor oficial e registre a data aqui. Este sistema não encerra manifestos na SEFAZ.", dedupe_key: `mdfe:${d.id}`, data: {} });
    }
    const st = expiryState(d.expires_on, i.today, s.docWarnDays);
    if (st === "vencido" || st === "vencendo")
      add({ kind: "documento_vencimento", title: st === "vencido" ? "Documento vencido" : "Documento perto do vencimento", description: `${d.kind.toUpperCase()} ${d.number ?? ""}: vence em ${d.expires_on}.`, priority: st === "vencido" ? "alta" : "media", ref_path: "/fiscal", action: "Renove o documento e atualize o cadastro.", dedupe_key: `doc:${d.id}:${d.expires_on}:${st}`, data: {} });
  }
  for (const p of i.policies) {
    const st = expiryState(p.valid_to, i.today, s.docWarnDays);
    if (st === "vencido" || st === "vencendo")
      add({ kind: "seguro", title: st === "vencido" ? "Seguro vencido" : "Apólice perto do vencimento", description: `Apólice ${p.number}: vigência até ${p.valid_to}.`, priority: st === "vencido" ? "critica" : "media", ref_path: "/seguros", action: "Renove a apólice antes de novas viagens.", dedupe_key: `seguro:${p.id}:${p.valid_to}:${st}`, data: {} });
  }
  for (const d of i.vehicleDocs) {
    const st = expiryState(d.expires_on, i.today, s.docWarnDays);
    if (st === "vencido" || st === "vencendo")
      add({ kind: "documento_veiculo", title: st === "vencido" ? "Documento de veículo vencido" : "Documento de veículo vencendo", description: `${d.kind}: vence em ${d.expires_on}.`, priority: st === "vencido" ? "alta" : "media", ref_path: `/veiculos/${d.vehicle_id}`, action: "Renove e anexe o novo documento.", dedupe_key: `vdoc:${d.id}:${d.expires_on}:${st}`, data: {} });
  }
  for (const d of i.drivers.filter((x) => x.active)) {
    const st = expiryState(d.cnh_expiry, i.today, s.docWarnDays);
    if (st === "vencido" || st === "vencendo")
      add({ kind: "cnh", title: st === "vencido" ? "CNH vencida" : "CNH perto do vencimento", description: `${d.name}: CNH vence em ${d.cnh_expiry}.`, priority: st === "vencido" ? "critica" : "media", ref_path: "/equipe", action: "Peça a renovação ao motorista.", dedupe_key: `cnh:${d.id}:${d.cnh_expiry}:${st}`, data: {} });
  }
  for (const m of maintenanceAlerts(i.maintenance, i.odometers, i.today))
    add({ kind: "manutencao", title: m.level === "vencida" ? "Manutenção vencida" : "Manutenção próxima", description: m.reason, priority: m.level === "vencida" ? "alta" : "baixa", ref_path: `/veiculos/${m.vehicle_id}`, action: "Agende a manutenção.", dedupe_key: `manut:${m.recordId}:${m.level}`, data: {} });
  return out;
}

/* ---------- Conformidade por viagem ---------- */
export function tripCompliance(t: { id: string; status: string }, fiscal: { kind: string; trip_id: string | null }[], ciot: { trip_id: string; status: string }[], proofTripIds: string[]) {
  const pend: string[] = [];
  const docs = fiscal.filter((d) => d.trip_id === t.id);
  if (!docs.some((d) => d.kind === "cte")) pend.push("CT-e não vinculado");
  const c = ciot.find((x) => x.trip_id === t.id);
  if (!c) pend.push("CIOT não analisado");
  else if (!["nao_aplicavel", "registrado"].includes(c.status)) pend.push(`CIOT: ${CIOT_STATUS[c.status]}`);
  if (t.status === "entregue" && !proofTripIds.includes(t.id)) pend.push("Sem comprovante de entrega");
  return pend;
}
