"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

type P = { code: string; name: string; price_month: number | null };

/** Lista os planos com preço e leva ao pagamento no Mercado Pago. Só aparece para quem pode assinar. */
export function SubscribeButton() {
  const [plans, setPlans] = useState<P[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSupabase()?.from("plans").select("code,name,price_month").eq("active", true).order("sort").then(({ data }) => setPlans((data as P[]) ?? []));
  }, []);

  async function go(code: string) {
    setBusy(code); setErr(null);
    const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
    const r = await fetch("/api/assinar", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify({ plan: code }) });
    const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (r.ok && j.url) { window.location.href = j.url; return; }
    setErr(j.error ?? "Não foi possível iniciar a assinatura."); setBusy(null);
  }

  return (
    <div className="mt-5 grid gap-2 text-left">
      {plans.map((p) => (
        <button key={p.code} type="button" disabled={!p.price_month || busy !== null} onClick={() => go(p.code)}
          className="flex min-h-11 items-center justify-between rounded-xl bg-pine-900 px-4 font-bold text-white disabled:opacity-50">
          <span>{p.name}</span>
          <span className="text-sm font-semibold text-lime-brand">{p.price_month ? `R$ ${p.price_month.toFixed(2).replace(".", ",")}/mês` : "preço a definir"}</span>
        </button>
      ))}
      {err && <p role="alert" className="text-sm font-semibold text-red-700">{err}</p>}
    </div>
  );
}
