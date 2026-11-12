"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { FEATURE_INFO } from "@/lib/plans";

export type PlanRow = { code: string; name: string; price_month: number | null; features: string[] | null };

export function usePlans() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  useEffect(() => {
    getSupabase()?.from("plans").select("code,name,price_month,features").eq("active", true).order("sort").then(({ data }) => setPlans((data as PlanRow[]) ?? []));
  }, []);
  return plans;
}

/** Cartões de plano: preço, o que está incluído e, quando houver, botão de assinar. */
export function PlanCards({ plans, currentCode, busy, onSubscribe }: { plans: PlanRow[]; currentCode?: string | null; busy?: string | null; onSubscribe?: (code: string) => void }) {
  return (
    <div className="grid gap-3 text-left md:grid-cols-3">
      {plans.map((p, i) => {
        const prev = plans[i - 1]?.features ?? [];
        const feats = p.features ?? [];
        const novos = feats.filter((f) => !prev.includes(f));
        return (
          <div key={p.code} className={`flex flex-col rounded-2xl border bg-white p-5 ${currentCode === p.code ? "border-pine-900 ring-2 ring-pine-900/20" : "border-line"}`}>
            <h3 className="text-lg font-extrabold text-pine-950">{p.name}{currentCode === p.code && <span className="ml-2 rounded-full bg-lime-brand px-2 py-0.5 text-xs font-bold text-pine-950">seu plano</span>}</h3>
            <p className="mt-1 text-2xl font-extrabold text-pine-900">{p.price_month ? `R$ ${p.price_month.toFixed(2).replace(".", ",")}` : "—"}<span className="text-sm font-semibold text-muted">/mês</span></p>
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted">{i === 0 ? "Inclui" : `Tudo do ${plans[i - 1].name}, mais`}</p>
            <ul className="mt-2 flex-1 space-y-2 text-sm">
              {novos.map((f) => (
                <li key={f}><b>✓ {FEATURE_INFO[f]?.label ?? f}</b>{FEATURE_INFO[f] && <span className="block pl-4 text-muted">{FEATURE_INFO[f].desc}</span>}</li>
              ))}
            </ul>
            {onSubscribe && (
              <button type="button" disabled={!p.price_month || !!busy} onClick={() => onSubscribe(p.code)} className="mt-4 min-h-11 rounded-xl bg-pine-900 px-4 font-bold text-white disabled:opacity-50">
                {busy === p.code ? "Abrindo…" : `Assinar ${p.name}`}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
