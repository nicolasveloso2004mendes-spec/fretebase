export type TripInput = {
  distanceKm: number; // ida
  roundTrip: boolean; // inclui retorno vazio
  consumptionKmL: number;
  dieselPrice: number;
  maintenancePerKm: number;
  tirePerKm: number;
  tolls: number;
  driver: number;
  other: number;
  taxPct: number; // % sobre o valor do frete
  freight: number;
};

export type TripResult = {
  totalKm: number;
  liters: number;
  diesel: number;
  maintenance: number;
  tires: number;
  tolls: number;
  driver: number;
  other: number;
  cost: number; // custo antes de impostos
  tax: number;
  profit: number; // sobra depois de impostos
  marginPct: number; // sobra / frete
  costPerKm: number;
};

const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export function computeTrip(i: TripInput): TripResult {
  const totalKm = safe(i.distanceKm) * (i.roundTrip ? 2 : 1);
  const liters = safe(i.consumptionKmL) > 0 ? totalKm / i.consumptionKmL : 0;
  const diesel = liters * safe(i.dieselPrice);
  const maintenance = totalKm * safe(i.maintenancePerKm);
  const tires = totalKm * safe(i.tirePerKm);
  const tolls = safe(i.tolls);
  const driver = safe(i.driver);
  const other = safe(i.other);
  const cost = diesel + maintenance + tires + tolls + driver + other;
  const freight = safe(i.freight);
  const tax = freight * (safe(i.taxPct) / 100);
  const profit = freight - cost - tax;
  return {
    totalKm,
    liters,
    diesel,
    maintenance,
    tires,
    tolls,
    driver,
    other,
    cost,
    tax,
    profit,
    marginPct: freight > 0 ? (profit / freight) * 100 : 0,
    costPerKm: totalKm > 0 ? cost / totalKm : 0,
  };
}

/** Frete mínimo para atingir a margem desejada (sobra / frete) depois de impostos. */
export function suggestedFreight(cost: number, taxPct: number, marginPct: number) {
  const divisor = 1 - safe(taxPct) / 100 - safe(marginPct) / 100;
  if (divisor <= 0) return 0;
  return cost / divisor;
}
