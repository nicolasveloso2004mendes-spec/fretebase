import { describe, expect, it } from "vitest";
import { averageConsumption, canStartTrip, consumptionAlert, consumptionSegments, daysUntil, expiryState, hasCritical, maintenanceAlerts, realizedCost, tireAlert, tireKm, tripResult } from "../lib/fleet";
import { computeTrip, suggestedFreight } from "../lib/calc";
import { toNumber } from "../lib/format";
import { canOpen, isAdmin, isReader, isStaff, navFor } from "../lib/permissions";

const log = (id: string, odo: number, liters: number, full: boolean, date = "2026-01-01") => ({ id, vehicle_id: "v1", date, odometer_km: odo, liters, full_tank: full });

describe("vencimentos", () => {
  it("classifica datas", () => {
    expect(daysUntil("2026-03-10", "2026-03-01")).toBe(9);
    expect(expiryState(null, "2026-03-01")).toBe("sem_data");
    expect(expiryState("2026-02-28", "2026-03-01")).toBe("vencido");
    expect(expiryState("2026-03-01", "2026-03-01")).toBe("vencendo");
    expect(expiryState("2026-03-31", "2026-03-01")).toBe("vencendo");
    expect(expiryState("2026-05-01", "2026-03-01")).toBe("em_dia");
  });
});

describe("consumo por tanque cheio", () => {
  it("calcula trecho entre dois tanques cheios", () => {
    const s = consumptionSegments([log("a", 1000, 100, true), log("b", 1500, 100, true)]);
    expect(s).toHaveLength(1);
    expect(s[0].kmPerLiter).toBeCloseTo(5);
  });
  it("soma abastecimentos parciais intermediários", () => {
    const s = consumptionSegments([log("a", 1000, 90, true), log("b", 1200, 40, false), log("c", 1500, 60, true)]);
    expect(s[0].liters).toBe(100);
    expect(s[0].kmPerLiter).toBeCloseTo(5);
  });
  it("não calcula sem dois tanques cheios e ignora ordem de entrada", () => {
    expect(consumptionSegments([log("a", 1000, 50, true), log("b", 1100, 20, false)])).toHaveLength(0);
    const s = consumptionSegments([log("b", 1500, 100, true), log("a", 1000, 100, true)]);
    expect(s).toHaveLength(1);
  });
  it("média ponderada e alerta de consumo", () => {
    const segs = consumptionSegments([log("a", 0, 1, true), log("b", 300, 100, true), log("c", 1000, 100, true)]);
    expect(averageConsumption(segs)).toBeCloseTo(5);
    expect(averageConsumption([])).toBeNull();
    expect(consumptionAlert(3, 5)).toBe(true);
    expect(consumptionAlert(4.5, 5)).toBe(false);
    expect(consumptionAlert(null, 5)).toBe(false);
  });
});

const m = (o: Partial<Parameters<typeof maintenanceAlerts>[0][number]>) => ({ id: "m1", vehicle_id: "v1", kind: "oleo", status: "concluida" as const, done_date: "2026-01-01", next_due_date: null, next_due_km: null, parts_cost: 0, labor_cost: 0, ...o });
describe("alertas de manutenção", () => {
  it("por data e por km", () => {
    expect(maintenanceAlerts([m({ next_due_date: "2026-02-01" })], {}, "2026-03-01")[0].level).toBe("vencida");
    expect(maintenanceAlerts([m({ next_due_date: "2026-03-10" })], {}, "2026-03-01")[0].level).toBe("proxima");
    expect(maintenanceAlerts([m({ next_due_km: 10000 })], { v1: 10500 }, "2026-03-01")[0].reason).toBe("km ultrapassado");
    expect(maintenanceAlerts([m({ next_due_km: 10000 })], { v1: 9500 }, "2026-03-01")[0].level).toBe("proxima");
    expect(maintenanceAlerts([m({ next_due_km: 10000 })], { v1: 5000 }, "2026-03-01")).toHaveLength(0);
  });
  it("só a manutenção mais recente do tipo gera alerta", () => {
    const a = m({ id: "old", done_date: "2025-01-01", next_due_date: "2025-06-01" });
    const b = m({ id: "new", done_date: "2026-02-01", next_due_date: "2026-09-01" });
    expect(maintenanceAlerts([a, b], {}, "2026-03-01")).toHaveLength(0);
  });
  it("ignora agendadas", () => {
    expect(maintenanceAlerts([m({ status: "agendada", next_due_date: "2020-01-01" })], {}, "2026-03-01")).toHaveLength(0);
  });
});

describe("pneus", () => {
  it("km acumulado e alerta", () => {
    const t = { status: "em_uso", installed_km: 100000, km_before: 20000, alert_km: 80000 };
    expect(tireKm(t, 150000)).toBe(70000);
    expect(tireAlert(t, 153000)).toBe("proximo");
    expect(tireAlert(t, 170000)).toBe("vencido");
    expect(tireAlert(t, 110000)).toBeNull();
    expect(tireAlert(t, 150000)).toBeNull();
    expect(tireKm({ ...t, status: "estoque" }, 999999)).toBe(20000);
  });
});

describe("custo real da viagem", () => {
  const trip = { freight_value: 10000, planned_cost: 6000, tax_value: 600 };
  it("usa o previsto sem despesas e o realizado com despesas", () => {
    const a = tripResult(trip, []);
    expect(a.usingRealized).toBe(false);
    expect(a.result).toBe(3400);
    const b = tripResult(trip, [{ kind: "combustivel", amount: 4000 }, { kind: "pedagio", amount: 500 }]);
    expect(b.usingRealized).toBe(true);
    expect(b.cost).toBe(4500);
    expect(b.result).toBe(4900);
    expect(b.diff).toBe(-1500);
  });
  it("agrupa por tipo", () => {
    expect(realizedCost([{ kind: "pedagio", amount: 10 }, { kind: "pedagio", amount: 5 }]).byKind.pedagio).toBe(15);
  });
});

describe("portão de saída da viagem", () => {
  const ok = { driverId: "d", vehicleId: "v", vehicleStatus: "disponivel", checklist: { has_critical: false, authorized_at: null } };
  it("libera com tudo certo", () => expect(canStartTrip(ok).ok).toBe(true));
  it("bloqueia sem motorista/veículo, sem checklist, veículo em manutenção", () => {
    expect(canStartTrip({ ...ok, driverId: null }).ok).toBe(false);
    expect(canStartTrip({ ...ok, checklist: null }).ok).toBe(false);
    expect(canStartTrip({ ...ok, vehicleStatus: "manutencao" }).ok).toBe(false);
  });
  it("bloqueia crítico sem autorização e libera com autorização", () => {
    expect(canStartTrip({ ...ok, checklist: { has_critical: true, authorized_at: null } }).ok).toBe(false);
    expect(canStartTrip({ ...ok, checklist: { has_critical: true, authorized_at: "2026-01-01" } }).ok).toBe(true);
    expect(hasCritical({ a: "ok", b: "critico" })).toBe(true);
    expect(hasCritical({ a: "ok", b: "atencao" })).toBe(false);
  });
});

describe("permissões de tela", () => {
  it("motorista só vê o portal; cliente só o início; financeiro lê mas não administra", () => {
    expect(canOpen("motorista", "/motorista")).toBe(true);
    expect(canOpen("motorista", "/viagens")).toBe(false);
    expect(canOpen("cliente", "/viagens")).toBe(false);
    expect(canOpen("financeiro", "/viagens")).toBe(true);
    expect(canOpen("financeiro", "/equipe")).toBe(false);
    expect(canOpen("operacional", "/equipe")).toBe(false);
    expect(canOpen("admin", "/equipe")).toBe(true);
    expect(canOpen("admin", "/motorista")).toBe(false);
    expect(isStaff("financeiro")).toBe(false);
    expect(isReader("financeiro")).toBe(true);
    expect(isAdmin("proprietario")).toBe(true);
    expect(navFor("motorista")).toHaveLength(1);
    expect(navFor("operacional").some((n) => n.href === "/equipe")).toBe(false);
  });
});

describe("regressão Fases 1 e 2 (cálculo de frete)", () => {
  const base = { distanceKm: 500, roundTrip: true, consumptionKmL: 2.5, dieselPrice: 6, maintenancePerKm: 0.5, tirePerKm: 0.3, tolls: 200, driver: 800, other: 100, taxPct: 6, freight: 6000 };
  it("custo, imposto e sobra", () => {
    const r = computeTrip(base);
    expect(r.totalKm).toBe(1000);
    expect(r.diesel).toBeCloseTo(2400);
    expect(r.cost).toBeCloseTo(2400 + 500 + 300 + 200 + 800 + 100);
    expect(r.tax).toBeCloseTo(360);
    expect(r.profit).toBeCloseTo(6000 - 4300 - 360);
  });
  it("sem retorno e entradas inválidas", () => {
    expect(computeTrip({ ...base, roundTrip: false }).totalKm).toBe(500);
    expect(computeTrip({ ...base, consumptionKmL: 0 }).diesel).toBe(0);
    expect(computeTrip({ ...base, distanceKm: NaN }).totalKm).toBe(0);
  });
  it("frete sugerido atinge a margem pedida", () => {
    const f = suggestedFreight(4300, 6, 20);
    expect(f).toBeCloseTo(4300 / (1 - 0.06 - 0.2));
  });
  it("toNumber aceita formato brasileiro", () => {
    expect(toNumber("1.234,56")).toBe(1234.56);
    expect(toNumber("abc")).toBe(0);
  });
});

describe("custo previsto sem imposto (evita descontar o imposto duas vezes)", () => {
  it("cotação 3885,91 + imposto 276 vira planned_cost 3885,91 e resultado igual à sobra da cotação", async () => {
    const { plannedCostWithoutTax, tripResult } = await import("@/lib/fleet");
    const planned = plannedCostWithoutTax(4161.91, 276);
    expect(planned).toBe(3885.91);
    expect(tripResult({ freight_value: 4600, planned_cost: planned, tax_value: 276 }, []).result).toBeCloseTo(438.09, 2);
  });
});
