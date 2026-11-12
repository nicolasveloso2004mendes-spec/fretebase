"use client";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { PlanCards, usePlans } from "@/components/PlanCards";
import { Card, PageHeader } from "@/components/ui";

const STATUS: Record<string, string> = { teste: "Em teste", ativa: "Ativa", suspensa: "Suspensa", cancelada: "Cancelada" };

export default function AssinaturaPage() {
  const { org, member } = useAppSession();
  const plans = usePlans();
  const canChange = (member?.role === "proprietario" || member?.role === "admin") && org?.status === "ativa";
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!org?.id) return;
    getSupabase()?.from("orgs").select("pending_plan_code").eq("id", org.id).maybeSingle().then(({ data }) => setPending((data as { pending_plan_code: string | null } | null)?.pending_plan_code ?? null));
  }, [org?.id, msg]);

  async function change(code: string) {
    setBusy(code); setMsg(null);
    const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
    const r = await fetch("/api/assinatura/mudar-plano", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` }, body: JSON.stringify({ plan: code }) });
    const j = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
    setMsg(r.ok ? (j.message ?? "Troca registrada.") : (j.error ?? "Não foi possível trocar o plano."));
    setBusy(null);
  }

  const current = plans.find((p) => p.code === org?.plan?.code);
  return (
    <>
      <PageHeader crumb="Conta" title="Assinatura e plano" subtitle="Veja o que cada plano inclui e mude de plano quando precisar." />
      <Card>
        <p className="text-sm text-muted">Seu plano atual</p>
        <p className="text-xl font-extrabold text-pine-950">{org?.plan?.name ?? "—"}{current?.price_month ? <span className="ml-2 text-base font-semibold text-muted">R$ {current.price_month.toFixed(2).replace(".", ",")}/mês</span> : null}</p>
        <p className="mt-1 text-sm text-muted">Situação: <b>{STATUS[org?.status ?? ""] ?? org?.status}</b></p>
      </Card>
      <div className="mt-4">
        {pending && <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Troca para o plano {plans.find((x) => x.code === pending)?.name ?? pending} solicitada. Ela vale quando a próxima cobrança for aprovada.</p>}
        <PlanCards plans={plans} currentCode={org?.plan?.code} pendingCode={pending} busy={busy} onSubscribe={canChange ? change : undefined} actionLabel={(p) => `Mudar para ${p.name}`} />
        {msg && <p role="status" className="mt-3 text-sm font-semibold">{msg}</p>}
        {!canChange && <p className="mt-3 text-sm text-muted">Só o proprietário ou administrador pode mudar o plano{org?.status !== "ativa" ? ", e a empresa precisa estar com a assinatura ativa" : ""}.</p>}
        <p className="mt-3 text-xs text-muted">O novo valor vale a partir da próxima cobrança; o plano muda quando ela for aprovada.</p>
      </div>
    </>
  );
}
