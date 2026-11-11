"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { isAdmin } from "@/lib/permissions";
import { Card } from "@/components/ui";

type Step = { done: boolean; label: string; href: string };

/** Checklist de primeiros passos para administradores. Some sozinho quando tudo está feito. */
export function Onboarding() {
  const { member, org } = useAppSession();
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    if (!isAdmin(member?.role ?? null) || !org) return;
    const sb = getSupabase()!;
    const count = (t: string) => sb.from(t).select("id", { count: "exact", head: true }).then((r) => r.count ?? 0);
    Promise.all([count("vehicles"), count("drivers"), count("clients"), count("tax_rules"), sb.from("members").select("user_id", { count: "exact", head: true }).then((r) => r.count ?? 0), count("quotes")]).then(([v, d, c, t, m, q]) => {
      const s = (org.settings ?? {}) as { alerts?: unknown; eta?: unknown };
      setSteps([
        { done: Boolean(org.cnpj && (org.legal_name || org.trade_name)), label: "Dados da empresa (razão social e CNPJ)", href: "/configuracoes" },
        { done: t > 0, label: "Regra fiscal (valide com seu contador)", href: "/configuracoes" },
        { done: v > 0, label: "Cadastrar veículos", href: "/veiculos" },
        { done: d > 0, label: "Cadastrar motoristas", href: "/frota" },
        { done: c > 0, label: "Cadastrar clientes", href: "/clientes" },
        { done: m > 1, label: "Convidar a equipe", href: "/equipe" },
        { done: Boolean(s.alerts || s.eta), label: "Ajustar alertas e parâmetros de previsão", href: "/configuracoes" },
        { done: q > 0, label: "Fazer a primeira cotação", href: "/cotacoes/nova" },
      ]);
    });
  }, [member?.role, org]);

  if (!steps || steps.every((s) => s.done)) return null;
  const done = steps.filter((s) => s.done).length;
  return (
    <Card className="mb-6">
      <h2 className="text-lg font-extrabold text-pine-950">Primeiros passos ({done}/{steps.length})</h2>
      <ul className="mt-3 space-y-1.5 text-sm">
        {steps.map((s) => <li key={s.label}>{s.done ? <span className="text-green-800">✓ {s.label}</span> : <Link href={s.href} className="font-semibold text-pine-800 underline">○ {s.label}</Link>}</li>)}
      </ul>
    </Card>
  );
}
