"use client";
import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { PlanCards, usePlans } from "@/components/PlanCards";

/** Mostra os planos com o que cada um inclui e leva ao pagamento no Mercado Pago. Só aparece para quem pode assinar. */
export function SubscribeButton() {
  const plans = usePlans();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function go(code: string) {
    setBusy(code); setErr(null);
    const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
    const r = await fetch("/api/assinar", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify({ plan: code }) });
    const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (r.ok && j.url) { window.location.href = j.url; return; }
    setErr(j.error ?? "Não foi possível iniciar a assinatura."); setBusy(null);
  }

  return (
    <div className="mt-5">
      <PlanCards plans={plans} busy={busy} onSubscribe={go} />
      {err && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{err}</p>}
    </div>
  );
}
