"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { dateBR } from "@/lib/format";
import { Badge, Button, Card, ErrorBox, Loading, PageHeader, Empty } from "@/components/ui";

type Req = { id: string; name: string; phone: string; email: string | null; origin: string; destination: string; cargo: string | null; weight_kg: number | null; notes: string | null; status: "novo" | "atendido" | "descartado"; created_at: string };

export default function LinkCotacaoPage() {
  const [link, setLink] = useState<{ slug: string; enabled: boolean } | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const sb = getSupabase();
    if (!sb) return;
    setError(null);
    const l = await sb.rpc("get_public_quote_link");
    if (l.error) { setError(l.error.message); setLoading(false); return; }
    setLink(l.data as { slug: string; enabled: boolean });
    const r = await sb.from("public_quote_requests").select("*").order("created_at", { ascending: false }).limit(200);
    if (r.error) setError(r.error.message); else setReqs((r.data ?? []) as Req[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle() {
    const sb = getSupabase();
    if (!sb || !link) return;
    const { error: e } = await sb.rpc("set_public_quote_link", { p_enabled: !link.enabled });
    if (e) setError(e.message); else setLink({ ...link, enabled: !link.enabled });
  }
  async function setStatus(id: string, status: Req["status"]) {
    const sb = getSupabase();
    if (!sb) return;
    const { error: e } = await sb.from("public_quote_requests").update({ status }).eq("id", id);
    if (e) setError(e.message); else setReqs(reqs.map((x) => (x.id === id ? { ...x, status } : x)));
  }
  const url = link ? `${typeof window !== "undefined" ? window.location.origin : ""}/cotar/${link.slug}` : "";
  async function copy() { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignora */ } }
  const wa = (r: Req) => {
    const d = r.phone.replace(/\D/g, "");
    const n = d.length <= 11 ? `55${d}` : d;
    return `https://wa.me/${n}?text=${encodeURIComponent(`Olá, ${r.name}! Recebemos seu pedido de cotação de ${r.origin} para ${r.destination}.`)}`;
  };

  if (loading) return <Loading />;
  return (
    <div>
      <PageHeader crumb="Operação" title="Link de cotação para clientes" subtitle="Envie este link pelo WhatsApp. O cliente pede o frete sem precisar de login." />
      {error && <ErrorBox message={error} onRetry={load} />}
      {link && (
        <Card className="mb-6 space-y-3">
          <div className="flex items-center gap-2">
            <Badge tone={link.enabled ? "good" : "neutral"}>{link.enabled ? "Link ativo" : "Link desativado"}</Badge>
            <Button variant="ghost" onClick={toggle}>{link.enabled ? "Desativar" : "Ativar"}</Button>
          </div>
          <p className="break-all rounded-lg bg-paper px-3 py-2 text-sm">{url}</p>
          <Button onClick={copy}>{copied ? "Copiado!" : "Copiar link"}</Button>
          <p className="text-xs text-ink/60">Os pedidos ficam guardados por 180 dias. Há limite automático de envios por hora e por telefone contra spam.</p>
        </Card>
      )}
      <h2 className="mb-3 text-lg font-semibold">Pedidos recebidos</h2>
      {reqs.length === 0 ? <Empty title="Nenhum pedido ainda" text="Quando um cliente enviar o formulário, ele aparece aqui." /> : (
        <div className="space-y-3">
          {reqs.map((r) => (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{r.name}</strong>
                <Badge tone={r.status === "novo" ? "warn" : r.status === "atendido" ? "good" : "neutral"}>{r.status}</Badge>
              </div>
              <p className="mt-1 text-sm">{r.origin} → {r.destination}{r.cargo ? ` · ${r.cargo}` : ""}{r.weight_kg ? ` · ${r.weight_kg} kg` : ""}</p>
              {r.notes && <p className="mt-1 text-sm text-ink/70">{r.notes}</p>}
              <p className="mt-1 text-xs text-ink/60">{r.phone}{r.email ? ` · ${r.email}` : ""} · {dateBR(r.created_at)}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a className="rounded-lg bg-pine-900 px-3 py-2 text-sm font-semibold text-white" href={wa(r)} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a>
                {r.status !== "atendido" && <Button variant="ghost" onClick={() => setStatus(r.id, "atendido")}>Marcar atendido</Button>}
                {r.status !== "descartado" && <Button variant="ghost" onClick={() => setStatus(r.id, "descartado")}>Descartar</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
