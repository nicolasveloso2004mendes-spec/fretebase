"use client";
import { useState } from "react";
import { useTable } from "@/lib/useTable";
import { getSupabase } from "@/lib/supabase";
import { dateBR } from "@/lib/format";
import { Badge, Button, Card, Empty, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";

type T = { id: string; subject: string; priority: string; status: string; assignee: string | null; created_at: string };
type M = { id: string; ticket_id: string; author_kind: string; body: string; created_at: string };

export default function SuportePage() {
  const tickets = useTable<T>("support_tickets");
  const msgs = useTable<M>("support_messages", { order: "created_at" });
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ subject: "", priority: "normal", body: "" });
  const [reply, setReply] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    const sb = getSupabase()!;
    const { data, error } = await sb.from("support_tickets").insert({ subject: v.subject, priority: v.priority }).select("id").single();
    if (error || !data) return setErr("Não foi possível abrir o chamado.");
    await sb.from("support_messages").insert({ ticket_id: data.id, body: v.body });
    setOpen(false); setV({ subject: "", priority: "normal", body: "" }); tickets.reload(); msgs.reload();
  }
  async function send(id: string) {
    const body = reply[id]?.trim(); if (!body) return;
    const { error } = await getSupabase()!.from("support_messages").insert({ ticket_id: id, body });
    if (!error) { setReply({ ...reply, [id]: "" }); msgs.reload(); }
  }
  return (
    <>
      <PageHeader crumb="Conta" title="Suporte" subtitle="Abra chamados para a equipe da NicoTech." action={!open && <Button onClick={() => setOpen(true)}>Novo chamado</Button>} />
      {open && <Card className="mb-6"><form onSubmit={create} className="grid gap-4"><Field label="Assunto"><Input required maxLength={200} value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} /></Field>
        <Field label="Prioridade"><Select value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })}><option value="baixa">Baixa</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="urgente">Urgente</option></Select></Field>
        <Field label="Descreva o problema" hint="Não envie senhas nem dados pessoais desnecessários."><Textarea required maxLength={3000} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} /></Field>
        {err && <p role="alert" className="text-sm font-semibold text-danger">{err}</p>}<div className="flex gap-3"><Button type="submit">Abrir chamado</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button></div></form></Card>}
      {tickets.loading ? <Loading /> : tickets.rows.length === 0 ? <Empty title="Nenhum chamado" text="Quando precisar de ajuda, abra um chamado aqui." /> : (
        <ul className="space-y-4">{tickets.rows.map((t) => <li key={t.id}><Card><div className="flex flex-wrap items-center gap-2"><Badge tone={t.status === "resolvido" ? "good" : "warn"}>{t.status === "aberto" ? "Aberto" : t.status === "em_atendimento" ? "Em atendimento" : "Resolvido"}</Badge><b>{t.subject}</b><span className="text-xs text-muted">{dateBR(t.created_at)} · prioridade {t.priority}{t.assignee ? ` · responsável ${t.assignee}` : ""}</span></div>
          <ul className="mt-3 space-y-2 text-sm">{msgs.rows.filter((m) => m.ticket_id === t.id).map((m) => <li key={m.id} className={m.author_kind === "nicotech" ? "rounded-xl bg-paper p-2" : ""}><b>{m.author_kind === "nicotech" ? "NicoTech" : "Você"}:</b> {m.body}</li>)}</ul>
          {t.status !== "resolvido" && <div className="mt-3 flex gap-3"><div className="flex-1"><Input aria-label="Responder" placeholder="Responder…" value={reply[t.id] ?? ""} onChange={(e) => setReply({ ...reply, [t.id]: e.target.value })} /></div><Button variant="ghost" onClick={() => send(t.id)}>Enviar</Button></div>}</Card></li>)}</ul>)}
    </>
  );
}
