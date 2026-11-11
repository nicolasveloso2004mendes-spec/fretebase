/** Regras puras da gestão de frota (sem acesso a banco), para serem testadas. */

export type ExpiryState = "sem_data" | "vencido" | "vencendo" | "em_dia";

export function daysUntil(dateIso: string, todayIso: string) {
  const a = Date.UTC(+dateIso.slice(0, 4), +dateIso.slice(5, 7) - 1, +dateIso.slice(8, 10));
  const b = Date.UTC(+todayIso.slice(0, 4), +todayIso.slice(5, 7) - 1, +todayIso.slice(8, 10));
  return Math.round((a - b) / 86_400_000);
}

export function expiryState(dateIso: string | null | undefined, todayIso: string, warnDays = 30): ExpiryState {
  if (!dateIso) return "sem_data";
  const d = daysUntil(dateIso, todayIso);
  if (d < 0) return "vencido";
  if (d <= warnDays) return "vencendo";
  return "em_dia";
}

/* ---------- Consumo (método do tanque cheio) ---------- */

export type FuelLog = { id: string; vehicle_id: string; date: string; odometer_km: number; liters: number; full_tank: boolean };
export type ConsumptionSegment = { fromKm: number; toKm: number; km: number; liters: number; kmPerLiter: number };

/**
 * Entre dois abastecimentos de tanque cheio consecutivos (por hodômetro), os litros abastecidos
 * depois do primeiro e até o segundo (inclusive) foram gastos nos km rodados entre eles.
 * Abastecimentos parciais entram na soma de litros, mas não fecham um trecho.
 */
export function consumptionSegments(logs: FuelLog[]): ConsumptionSegment[] {
  const sorted = [...logs].sort((a, b) => a.odometer_km - b.odometer_km || a.date.localeCompare(b.date));
  const out: ConsumptionSegment[] = [];
  let anchor: FuelLog | null = null;
  let liters = 0;
  for (const l of sorted) {
    if (anchor) liters += l.liters;
    if (l.full_tank) {
      if (anchor && l.odometer_km > anchor.odometer_km && liters > 0) {
        const km = l.odometer_km - anchor.odometer_km;
        out.push({ fromKm: anchor.odometer_km, toKm: l.odometer_km, km, liters, kmPerLiter: km / liters });
      }
      anchor = l;
      liters = 0;
    }
  }
  return out;
}

export function averageConsumption(segments: ConsumptionSegment[]) {
  const km = segments.reduce((s, x) => s + x.km, 0);
  const l = segments.reduce((s, x) => s + x.liters, 0);
  return l > 0 ? km / l : null;
}

/** Aviso de consumo anormal: trecho mais de `tolerance` abaixo do consumo de referência do cadastro. */
export function consumptionAlert(actual: number | null, reference: number | null | undefined, tolerance = 0.2) {
  if (actual === null || !reference || reference <= 0) return false;
  return actual < reference * (1 - tolerance);
}

/* ---------- Manutenção ---------- */

export type Maint = {
  id: string;
  vehicle_id: string;
  kind: string;
  status: "agendada" | "concluida";
  done_date: string | null;
  next_due_date: string | null;
  next_due_km: number | null;
  parts_cost: number;
  labor_cost: number;
};

export type MaintAlert = { vehicle_id: string; kind: string; level: "vencida" | "proxima"; reason: string; recordId: string };

/** Só a manutenção mais recente de cada tipo, por veículo, gera alerta (a anterior já foi superada). */
export function maintenanceAlerts(records: Maint[], odometers: Record<string, number>, todayIso: string, warnDays = 15, warnKm = 1000): MaintAlert[] {
  const latest = new Map<string, Maint>();
  for (const r of records) {
    if (r.status !== "concluida") continue;
    const key = `${r.vehicle_id}|${r.kind}`;
    const cur = latest.get(key);
    if (!cur || (r.done_date ?? "") > (cur.done_date ?? "")) latest.set(key, r);
  }
  const alerts: MaintAlert[] = [];
  for (const r of latest.values()) {
    const odo = odometers[r.vehicle_id] ?? 0;
    if (r.next_due_date) {
      const d = daysUntil(r.next_due_date, todayIso);
      if (d < 0) alerts.push({ vehicle_id: r.vehicle_id, kind: r.kind, level: "vencida", reason: "data vencida", recordId: r.id });
      else if (d <= warnDays) alerts.push({ vehicle_id: r.vehicle_id, kind: r.kind, level: "proxima", reason: `vence em ${d} dia(s)`, recordId: r.id });
    }
    if (r.next_due_km !== null && r.next_due_km !== undefined) {
      const left = r.next_due_km - odo;
      if (left < 0) alerts.push({ vehicle_id: r.vehicle_id, kind: r.kind, level: "vencida", reason: "km ultrapassado", recordId: r.id });
      else if (left <= warnKm) alerts.push({ vehicle_id: r.vehicle_id, kind: r.kind, level: "proxima", reason: `faltam ${Math.round(left)} km`, recordId: r.id });
    }
  }
  return alerts;
}

export const maintCost = (r: { parts_cost: number; labor_cost: number }) => Number(r.parts_cost) + Number(r.labor_cost);

/** Custo de manutenção por km rodado, com base no hodômetro inicial conhecido. Null se não há base. */
export function maintenanceCostPerKm(totalCost: number, kmRun: number) {
  return kmRun > 0 ? totalCost / kmRun : null;
}

/* ---------- Pneus ---------- */

export type Tire = { status: string; installed_km: number | null; km_before: number; alert_km: number | null };

export function tireKm(t: Tire, vehicleOdometer: number | null | undefined) {
  const before = Number(t.km_before) || 0;
  if (t.status !== "em_uso" || t.installed_km === null || t.installed_km === undefined) return before;
  return before + Math.max(0, (vehicleOdometer ?? t.installed_km) - t.installed_km);
}

export function tireAlert(t: Tire, vehicleOdometer: number | null | undefined) {
  if (t.status !== "em_uso" || !t.alert_km) return null;
  const km = tireKm(t, vehicleOdometer);
  if (km >= t.alert_km) return "vencido" as const;
  if (km >= t.alert_km * 0.9) return "proximo" as const;
  return null;
}

export const tireCostPerKm = (totalCost: number, km: number) => (km > 0 ? totalCost / km : null);

/* ---------- Viagem: custo previsto x realizado ---------- */

export type Expense = { kind: string; amount: number };

export function realizedCost(expenses: Expense[]) {
  const byKind: Record<string, number> = {};
  for (const e of expenses) byKind[e.kind] = (byKind[e.kind] ?? 0) + Number(e.amount);
  return { total: Object.values(byKind).reduce((s, v) => s + v, 0), byKind };
}

/** Resultado após custos reais: frete − custo real − imposto previsto. Sem despesas lançadas, usa o previsto (e avisa). */
export function tripResult(trip: { freight_value: number; planned_cost: number; tax_value: number }, expenses: Expense[]) {
  const real = realizedCost(expenses);
  const hasReal = expenses.length > 0;
  const cost = hasReal ? real.total : Number(trip.planned_cost);
  return {
    usingRealized: hasReal,
    cost,
    result: Number(trip.freight_value) - cost - Number(trip.tax_value),
    plannedResult: Number(trip.freight_value) - Number(trip.planned_cost) - Number(trip.tax_value),
    diff: hasReal ? real.total - Number(trip.planned_cost) : 0,
  };
}

/* ---------- Checklist ---------- */

export type ChecklistValue = "ok" | "atencao" | "critico";
export const CHECKLIST_ITEMS: { key: string; label: string }[] = [
  { key: "pneus", label: "Pneus (calibragem e desgaste)" },
  { key: "freios", label: "Freios" },
  { key: "luzes", label: "Luzes e sinalização" },
  { key: "oleo", label: "Nível de óleo" },
  { key: "agua", label: "Água / arrefecimento" },
  { key: "documentos", label: "Documentos do veículo e da carga" },
  { key: "extintor", label: "Extintor de incêndio" },
  { key: "triangulo", label: "Triângulo, estepe e macaco" },
  { key: "carga", label: "Amarração da carga" },
  { key: "limpeza", label: "Limpeza e estado do baú/carroceria" },
];

export const hasCritical = (items: Record<string, string>) => Object.values(items).some((v) => v === "critico");

export type ChecklistState = { has_critical: boolean; authorized_at: string | null } | null;

/** Espelha a regra do gatilho trips_before_update. O banco é quem barra de verdade. */
export function canStartTrip(args: {
  driverId: string | null;
  vehicleId: string | null;
  vehicleStatus?: string | null;
  checklist: ChecklistState;
}): { ok: true } | { ok: false; reason: string } {
  if (!args.driverId || !args.vehicleId) return { ok: false, reason: "Atribua motorista e veículo antes de iniciar a viagem." };
  if (args.vehicleStatus === "manutencao" || args.vehicleStatus === "inativo") return { ok: false, reason: `Veículo indisponível (${args.vehicleStatus}).` };
  if (!args.checklist) return { ok: false, reason: "Preencha o checklist do veículo antes de iniciar a viagem." };
  if (args.checklist.has_critical && !args.checklist.authorized_at) return { ok: false, reason: "Checklist com pendência crítica: aguarda autorização da gestão." };
  return { ok: true };
}

/* ---------- Rótulos ---------- */

export const MAINT_KIND: Record<string, string> = { oleo: "Troca de óleo", revisao: "Revisão", filtros: "Filtros", mecanica: "Mecânica", eletrica: "Elétrica", pneus: "Pneus", outros: "Outros" };
export const EXPENSE_KIND: Record<string, string> = { combustivel: "Combustível", pedagio: "Pedágio", alimentacao: "Alimentação", estacionamento: "Estacionamento", manutencao: "Manutenção", outros: "Outros" };
export const VEHICLE_STATUS: Record<string, string> = { disponivel: "Disponível", em_viagem: "Em viagem", manutencao: "Em manutenção", inativo: "Inativo" };
export const TIRE_STATUS: Record<string, string> = { em_uso: "Em uso", estoque: "Em estoque", recapagem: "Em recapagem", descartado: "Descartado" };
export const TIRE_EVENT: Record<string, string> = { instalacao: "Instalação", rodizio: "Rodízio", recapagem: "Recapagem", troca: "Troca", descarte: "Descarte" };
export const EVENT_LABEL: Record<string, string> = { coleta: "Coleta confirmada", inicio: "Viagem iniciada", parada: "Parada", atraso: "Atraso", ocorrencia: "Ocorrência", entrega: "Entrega", status: "Situação", checklist: "Checklist", autorizacao: "Autorização" };
