/** Indicadores calculados só a partir dos registros reais. Nada é estimado além do que está indicado em cada campo. */
export type BiTrip = {
  id: string; origin: string; destination: string; status: string; client_id: string | null; vehicle_id: string | null; driver_id: string | null;
  freight_value: number; planned_cost: number; tax_value: number; distance_km: number | null;
  pickup_date: string | null; delivery_date: string | null; delivered_at: string | null; created_at: string;
  payment_status: string; payment_due: string | null;
};
export type BiExpense = { trip_id: string; kind: string; amount: number };

/** Data de referência da viagem: entrega real, senão coleta, senão criação. */
export const refDate = (t: BiTrip) => (t.delivered_at ?? t.pickup_date ?? t.created_at).slice(0, 10);
export const inPeriod = (trips: BiTrip[], from: string, to: string) => trips.filter((t) => t.status !== "cancelada" && refDate(t) >= from && refDate(t) <= to);

export function tripNumbers(t: BiTrip, expenses: BiExpense[]) {
  const mine = expenses.filter((e) => e.trip_id === t.id);
  const real = mine.reduce((s, e) => s + Number(e.amount), 0);
  const usingRealized = mine.length > 0;
  const cost = usingRealized ? real : Number(t.planned_cost);
  const profit = Number(t.freight_value) - cost - Number(t.tax_value);
  return { cost, profit, usingRealized, fuel: mine.filter((e) => e.kind === "combustivel").reduce((s, e) => s + Number(e.amount), 0) };
}

export type Summary = {
  count: number; revenue: number; cost: number; tax: number; profit: number; marginPct: number | null; avgFreight: number | null;
  km: number; costPerKm: number | null; fuel: number; lossTrips: number; plannedOnly: number; onTimeRate: number | null; onTimeBase: number;
};

export function summarize(trips: BiTrip[], expenses: BiExpense[]): Summary {
  let revenue = 0, cost = 0, tax = 0, profit = 0, km = 0, kmCost = 0, fuel = 0, lossTrips = 0, plannedOnly = 0, onTime = 0, onTimeBase = 0;
  for (const t of trips) {
    const n = tripNumbers(t, expenses);
    revenue += Number(t.freight_value); cost += n.cost; tax += Number(t.tax_value); profit += n.profit; fuel += n.fuel;
    if (t.distance_km && t.distance_km > 0) { km += Number(t.distance_km); kmCost += n.cost; }
    if (n.profit < 0) lossTrips++;
    if (!n.usingRealized) plannedOnly++;
    if (t.status === "entregue" && t.delivery_date && t.delivered_at) { onTimeBase++; if (t.delivered_at.slice(0, 10) <= t.delivery_date) onTime++; }
  }
  return {
    count: trips.length, revenue, cost, tax, profit, marginPct: revenue > 0 ? (profit / revenue) * 100 : null, avgFreight: trips.length ? revenue / trips.length : null,
    km, costPerKm: km > 0 ? kmCost / km : null, fuel, lossTrips, plannedOnly, onTimeRate: onTimeBase ? (onTime / onTimeBase) * 100 : null, onTimeBase,
  };
}

export type GroupRow = { key: string; label: string; count: number; revenue: number; profit: number; marginPct: number | null };
export function groupBy(trips: BiTrip[], expenses: BiExpense[], keyOf: (t: BiTrip) => string | null, labelOf: (key: string) => string): GroupRow[] {
  const m = new Map<string, BiTrip[]>();
  for (const t of trips) {
    const k = keyOf(t) ?? "—";
    m.set(k, [...(m.get(k) ?? []), t]);
  }
  return [...m.entries()]
    .map(([key, ts]) => {
      const s = summarize(ts, expenses);
      return { key, label: key === "—" ? "Sem vínculo" : labelOf(key), count: s.count, revenue: s.revenue, profit: s.profit, marginPct: s.marginPct };
    })
    .sort((a, b) => b.profit - a.profit);
}
export const routeKey = (t: BiTrip) => `${t.origin.trim()} → ${t.destination.trim()}`;

export function monthly(trips: BiTrip[], expenses: BiExpense[]) {
  const m = new Map<string, BiTrip[]>();
  for (const t of trips.filter((x) => x.status !== "cancelada")) {
    const k = refDate(t).slice(0, 7);
    m.set(k, [...(m.get(k) ?? []), t]);
  }
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, ts]) => ({ month, ...summarize(ts, expenses) }));
}

export function overdueByClient(trips: BiTrip[], today: string) {
  const m = new Map<string, { total: number; count: number; oldest: string }>();
  for (const t of trips) {
    if (t.status === "cancelada" || t.payment_status !== "pendente" || !t.payment_due || t.payment_due >= today) continue;
    const k = t.client_id ?? "—";
    const cur = m.get(k) ?? { total: 0, count: 0, oldest: t.payment_due };
    m.set(k, { total: cur.total + Number(t.freight_value), count: cur.count + 1, oldest: cur.oldest < t.payment_due ? cur.oldest : t.payment_due });
  }
  return [...m.entries()].map(([client_id, v]) => ({ client_id, ...v })).sort((a, b) => b.total - a.total);
}

/** Variação percentual entre dois períodos; null quando a base é zero (não dá para comparar). */
export const change = (now: number, before: number) => (before !== 0 ? ((now - before) / Math.abs(before)) * 100 : null);

export function previousPeriod(from: string, to: string) {
  const a = new Date(from + "T00:00:00Z").getTime(), b = new Date(to + "T00:00:00Z").getTime();
  const len = b - a + 86400000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(a - len), to: iso(a - 86400000) };
}

/** CSV com separador ";" (Excel pt-BR). Células que começam com = + - @ são neutralizadas para evitar fórmulas maliciosas. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    if (typeof v !== "number" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}
