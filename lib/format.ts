const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export const money = (v: number | null | undefined) => brl.format(Number(v ?? 0));
export const km = (v: number | null | undefined) => `${num.format(Number(v ?? 0))} km`;
export const pct = (v: number) => `${num.format(v)}%`;

export function dateBR(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export const today = () => new Date().toISOString().slice(0, 10);

/** Aceita "1.234,56" ou "1234.56" e devolve número (0 se inválido). */
export function toNumber(v: string | number | null | undefined) {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  const s = String(v).trim();
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}
