"use client";
import { useEffect, useState } from "react";
import { fetchAll, rpc } from "@/lib/db";
import { useQuery } from "@/lib/useQuery";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { Notice } from "@/components/extra";
import { Card, ErrorBox, Loading, PageHeader } from "@/components/ui";

type N = { id: string; kind: string; title: string; body: string | null; read_at: string | null; created_at: string };
const KINDS: Record<string, string> = { programada: "Viagem programada", coleta: "Coleta realizada", em_transito: "Carga em trânsito", atraso: "Atraso identificado", entrega: "Entrega concluída" };

export default function PortalAvisosPage() {
  const { member } = useAppSession();
  const q = useQuery(() => fetchAll<N>("client_notifications", "*", "created_at"));
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  useEffect(() => {
    getSupabase()!.from("clients").select("notify_prefs").eq("id", member?.clientId ?? "").maybeSingle().then(({ data }) => setPrefs((data?.notify_prefs as Record<string, boolean>) ?? {}));
    rpc("client_mark_read").catch(() => undefined);
  }, [member?.clientId]);
  async function toggle(k: string) {
    const next = { ...prefs, [k]: !(prefs[k] ?? true) };
    setPrefs(next);
    await rpc("client_set_prefs", { p: next }).catch(() => setPrefs(prefs));
  }
  return (
    <>
      <PageHeader crumb="Portal do cliente" title="Avisos" subtitle="Notificações das suas cargas dentro do portal." />
      <Notice>Estes avisos aparecem aqui no portal. Envio por WhatsApp ou e-mail ainda não está ativo nesta empresa (depende de configuração da transportadora e do seu consentimento).</Notice>
      <Card className="mb-6"><h2 className="font-extrabold text-pine-950">Quais avisos você quer receber</h2>
        <div className="mt-2 grid sm:grid-cols-2">{Object.entries(KINDS).map(([k, l]) => <label key={k} className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="size-5" checked={prefs[k] ?? true} onChange={() => toggle(k)} />{l}</label>)}</div></Card>
      {q.loading ? <Loading /> : q.error ? <ErrorBox message={q.error} onRetry={q.reload} /> : !q.data?.length ? <p className="text-muted">Nenhum aviso ainda.</p> : <ul className="space-y-3">{q.data.map((n) => <li key={n.id} className="rounded-2xl border border-line bg-white p-4"><p className="font-bold text-pine-950">{n.title}</p><p className="text-sm text-muted">{n.body}</p><p className="mt-1 text-xs text-muted">{new Date(n.created_at).toLocaleString("pt-BR")}</p></li>)}</ul>}
    </>
  );
}
