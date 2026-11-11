"use client";
import type { ReactNode } from "react";
import { Badge } from "./ui";

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string }[] }) {
  return (
    <div role="tablist" className="no-print mb-5 flex flex-wrap gap-2">
      {items.map((i) => (
        <button key={i.id} role="tab" type="button" aria-selected={value === i.id} onClick={() => onChange(i.id)}
          className={`min-h-11 rounded-xl border px-4 text-sm font-bold ${value === i.id ? "border-pine-900 bg-pine-900 text-white" : "border-line bg-white text-ink hover:bg-paper"}`}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-paper text-xs uppercase tracking-wider text-muted">
          <tr>{head.map((h) => <th key={h} scope="col" className="px-4 py-3 font-semibold">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}
export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => <td className={`px-4 py-3 align-top ${className}`}>{children}</td>;

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad"; children: ReactNode }) {
  const c = { info: "border-sky-200 bg-sky-50 text-sky-900", warn: "border-amber-200 bg-amber-50 text-warn", bad: "border-red-200 bg-red-50 text-danger" }[tone];
  return <p role="note" className={`mb-5 rounded-xl border px-4 py-3 text-sm ${c}`}>{children}</p>;
}

export function Bars({ items, format }: { items: { label: string; value: number; negative?: boolean }[]; format: (n: number) => string }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  return (
    <ul className="space-y-2">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate" title={i.label}>{i.label}</span>
          <span className="h-3 rounded-full bg-paper" role="img" aria-label={`${i.label}: ${format(i.value)}`}>
            <span className={`block h-3 rounded-full ${i.value < 0 ? "bg-danger" : "bg-pine-700"}`} style={{ width: `${Math.max(2, (Math.abs(i.value) / max) * 100)}%` }} />
          </span>
          <span className="tnum font-semibold">{format(i.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export const PRIORITY: Record<string, { label: string; tone: "neutral" | "info" | "warn" | "bad" }> = {
  baixa: { label: "Baixa", tone: "neutral" }, media: { label: "Média", tone: "info" }, alta: { label: "Alta", tone: "warn" }, critica: { label: "Crítica", tone: "bad" },
};
export const PriorityBadge = ({ p }: { p: string }) => <Badge tone={PRIORITY[p]?.tone ?? "neutral"}>{PRIORITY[p]?.label ?? p}</Badge>;
