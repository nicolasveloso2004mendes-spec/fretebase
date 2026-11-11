"use client";
import { useState } from "react";
import Link from "next/link";
import { useTable } from "@/lib/useTable";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { syncAlerts } from "@/lib/autoAlerts";
import { PriorityBadge, Tabs } from "@/components/extra";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select } from "@/components/ui";

type Alert = { id: string; kind: string; title: string; description: string | null; priority: string; ref_path: string | null; action: string | null; status: string; created_at: string; resolved_at: string | null; resolution_note: string | null };
const ORDER: Record<string, number> = { critica: 0, alta: 1, media: 2, baixa: 3 };

export default function AlertasPage() {
  const { org } = useAppSession();
  const alerts = useTable<Alert>("alerts");
  const [tab, setTab] = useState<"aberto" | "resolvido">("aberto");
  const [prio, setPrio] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const rows = alerts.rows.filter((a) => a.status === tab && (!prio || a.priority === prio)).sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || b.created_at.localeCompare(a.created_at));

  async function verify() {
    setBusy(true); setMsg(null);
    try {
      const r = await syncAlerts((org?.settings as { alerts?: object } | undefined)?.alerts);
      setMsg(`Verificação concluída: ${r.created} condição(ões) analisada(s), ${r.closed} alerta(s) encerrado(s) automaticamente.`);
      await alerts.reload();
    } catch { setMsg("Não foi possível verificar agora."); }
    setBusy(false);
  }
  async function resolve(a: Alert) {
    const { data: u } = await getSupabase()!.auth.getUser();
    const { error } = await getSupabase()!.from("alerts").update({ status: "resolvido", resolved_at: new Date().toISOString(), resolved_by: u.user?.id, resolution_note: note[a.id]?.trim() || "Resolvido manualmente." }).eq("id", a.id);
    if (!error) alerts.reload();
  }

  return (
    <>
      <PageHeader crumb="Alertas" title="Central de alertas" subtitle="Pendências geradas automaticamente a partir dos seus registros."
        action={<Button onClick={verify} disabled={busy}>{busy ? "Verificando…" : "Verificar agora"}</Button>} />
      <p className="mb-5 text-sm text-muted">A verificação roda ao abrir o sistema (uma vez por dia por sessão) e quando você clica em “Verificar agora”. Não há serviço em segundo plano: para alertas sem ninguém conectado, é necessário agendar a verificação no servidor (veja a documentação).</p>
      {msg && <p role="status" className="mb-4 rounded-xl border border-line bg-white px-4 py-3 text-sm font-semibold">{msg}</p>}
      <Tabs value={tab} onChange={setTab} items={[{ id: "aberto", label: `Abertos (${alerts.rows.filter((a) => a.status === "aberto").length})` }, { id: "resolvido", label: "Resolvidos (histórico)" }]} />
      <div className="mb-5 max-w-xs"><Field label="Prioridade"><Select value={prio} onChange={(e) => setPrio(e.target.value)}><option value="">Todas</option><option value="critica">Crítica</option><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option></Select></Field></div>
      {alerts.loading ? <Loading /> : alerts.error ? <ErrorBox message={alerts.error} onRetry={alerts.reload} /> : rows.length === 0 ? <Empty title={tab === "aberto" ? "Nenhum alerta aberto" : "Nenhum alerta resolvido"} text={tab === "aberto" ? "Tudo em ordem pelos registros atuais. Clique em “Verificar agora” para reavaliar." : "O histórico aparece aqui."} /> : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={a.id}><Card>
              <div className="flex flex-wrap items-center gap-2"><PriorityBadge p={a.priority} /><h2 className="font-extrabold text-pine-950">{a.title}</h2><span className="text-xs text-muted">{new Date(a.created_at).toLocaleDateString("pt-BR")}</span></div>
              <p className="mt-2 text-sm">{a.description}</p>
              {a.action && <p className="mt-1 text-sm"><b>Ação recomendada:</b> {a.action}</p>}
              <div className="mt-3 flex flex-wrap items-end gap-3">
                {a.ref_path && <Link href={a.ref_path} className="min-h-11 content-center text-sm font-bold text-pine-700 underline">Abrir registro</Link>}
                {a.status === "aberto" ? (<><div className="min-w-48 flex-1"><Input placeholder="Nota (opcional)" value={note[a.id] ?? ""} onChange={(e) => setNote({ ...note, [a.id]: e.target.value })} aria-label="Nota de resolução" /></div><Button variant="ghost" onClick={() => resolve(a)}>Marcar como resolvido</Button></>)
                  : <Badge tone="good">Resolvido em {new Date(a.resolved_at!).toLocaleDateString("pt-BR")}{a.resolution_note ? ` — ${a.resolution_note}` : ""}</Badge>}
              </div>
            </Card></li>
          ))}
        </ul>
      )}
    </>
  );
}
