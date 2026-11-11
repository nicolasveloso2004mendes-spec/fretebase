"use client";
import { useState } from "react";
import Link from "next/link";
import { fetchAll } from "@/lib/db";
import { getSupabase } from "@/lib/supabase";
import { answer, type Answer, type AssistantData } from "@/lib/assistant";
import { today } from "@/lib/format";
import { Notice } from "@/components/extra";
import { Button, Card, Field, Input, PageHeader } from "@/components/ui";
import type { BiExpense, BiTrip } from "@/lib/bi";

const EXAMPLES = ["Quanto faturei neste mês?", "Quais viagens deram prejuízo?", "Quais clientes estão inadimplentes?", "Qual caminhão gera mais despesas?", "Qual motorista realizou mais entregas?", "Qual rota é mais rentável?", "Quais veículos precisam de manutenção?", "Quais documentos estão vencendo?"];

export default function AssistentePage() {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<{ q: string; a: Answer }[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function ask(question: string) {
    const text = question.trim().slice(0, 500);
    if (!text) return;
    setBusy(true); setErr(null);
    try {
      const [trips, expenses, clients, vehicles, drivers, maintenance, vdocs, policies] = await Promise.all([
        fetchAll<BiTrip>("trips"), fetchAll<BiExpense>("trip_expenses", "trip_id, kind, amount"), fetchAll<{ id: string; name: string }>("clients", "id, name"),
        fetchAll<AssistantData["vehicles"][number]>("vehicles", "id, name, plate, odometer_km"), fetchAll<AssistantData["drivers"][number]>("drivers", "id, name, cnh_expiry"),
        fetchAll<AssistantData["maintenance"][number]>("maintenance_records"), fetchAll<AssistantData["vehicleDocs"][number]>("vehicle_documents", "vehicle_id, kind, expires_on"), fetchAll<AssistantData["policies"][number]>("insurance_policies", "number, valid_to"),
      ]);
      const a = answer(text, { today: today(), trips, expenses, clients, vehicles, drivers, maintenance, vehicleDocs: vdocs, policies });
      const { error } = await getSupabase()!.from("assistant_queries").insert({ question: text, intent: a.intent, answered: a.answered });
      if (error) throw new Error(error.message.includes("Limite") || error.message.includes("Muitas") ? error.message : "Não foi possível registrar a consulta.");
      setLog([{ q: text, a }, ...log]); setQ("");
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }
  return (
    <>
      <PageHeader crumb="Gestão" title="Fretebase AI" subtitle="Pergunte sobre a sua operação em linguagem natural." />
      <Notice tone="warn"><b>Nenhum modelo de IA está conectado.</b> O assistente entende um conjunto fixo de perguntas e responde com cálculos sobre os seus próprios dados (apenas os que o seu perfil pode ver). O que ele não entende, ele diz que não entendeu: nunca inventa números. Textos digitados ou lidos em documentos nunca são executados nem mudam permissões.</Notice>
      <Card className="mb-5"><form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex flex-wrap items-end gap-3"><div className="min-w-60 flex-1"><Field label="Sua pergunta"><Input maxLength={500} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: Quanto faturei neste mês?" /></Field></div><Button type="submit" disabled={busy || !q.trim()}>{busy ? "Consultando…" : "Perguntar"}</Button></form>
        <div className="mt-3 flex flex-wrap gap-2">{EXAMPLES.map((e) => <button key={e} type="button" onClick={() => ask(e)} disabled={busy} className="min-h-11 rounded-full border border-line px-3 text-sm hover:bg-paper">{e}</button>)}</div>
        {err && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{err}</p>}</Card>
      <ul className="space-y-4">{log.map((l, i) => (
        <li key={i}><Card><p className="text-sm font-semibold text-muted">Você: {l.q}</p>
          <p className="mt-2">{l.a.text}</p>
          <dl className="mt-3 space-y-1 text-xs text-muted"><div><dt className="inline font-bold">Período: </dt><dd className="inline">{l.a.period}</dd></div>{l.a.calc && <div><dt className="inline font-bold">Como calculei: </dt><dd className="inline">{l.a.calc}</dd></div>}</dl>
          {l.a.links.length > 0 && <p className="mt-2 flex flex-wrap gap-3 text-sm">{l.a.links.map((k) => <Link key={k.href + k.label} href={k.href} className="font-semibold text-pine-700 underline">{k.label}</Link>)}</p>}</Card></li>))}</ul>
    </>
  );
}
