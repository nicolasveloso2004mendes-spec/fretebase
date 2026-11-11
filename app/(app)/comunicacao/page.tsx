"use client";
import { useState } from "react";
import { useTable } from "@/lib/useTable";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { Notice, Table, Tabs, Td } from "@/components/extra";
import { Badge, Button, Card, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import type { Trip, Client, Driver } from "@/lib/types";

export const EVENTS: Record<string, { label: string; body: string }> = {
  viagem_atribuida: { label: "Viagem atribuída ao motorista", body: "Olá {nome}, você foi escalado para a viagem {origem} → {destino}. Coleta: {coleta}." },
  coleta_confirmada: { label: "Coleta confirmada", body: "Olá {nome}, a coleta da sua carga ({origem} → {destino}) foi confirmada." },
  em_transito: { label: "Carga em trânsito", body: "Olá {nome}, sua carga saiu para entrega: {origem} → {destino}." },
  entrega_concluida: { label: "Entrega concluída", body: "Olá {nome}, a entrega {origem} → {destino} foi concluída." },
  documento_pendente: { label: "Documento pendente", body: "Olá {nome}, há um documento pendente da viagem {origem} → {destino}. Pode nos enviar?" },
  alerta_operacional: { label: "Alerta operacional", body: "Atenção: {origem} → {destino} precisa de acompanhamento." },
};
type Tpl = { id: string; event_kind: string; channel: string; body: string; active: boolean };
type Log = { id: string; channel: string; recipient: string | null; event_kind: string | null; body: string | null; status: string; created_at: string };
const LOGLABEL: Record<string, { l: string; t: "neutral" | "warn" | "good" | "bad" }> = { link_aberto: { l: "Link aberto (envio manual, sem confirmação)", t: "neutral" }, pendente_integracao: { l: "Não enviado: integração não configurada", t: "warn" }, falha: { l: "Falha", t: "bad" }, enviado_confirmado: { l: "Enviado (confirmado pelo provedor)", t: "good" } };

export default function ComunicacaoPage() {
  const { member } = useAppSession();
  const staff = isStaff(member?.role ?? null);
  const tpls = useTable<Tpl>("message_templates");
  const logs = useTable<Log>("message_log");
  const trips = useTable<Trip>("trips");
  const clients = useTable<Client>("clients");
  const drivers = useTable<Driver>("drivers");
  const [tab, setTab] = useState("enviar");
  const [sel, setSel] = useState({ event: "em_transito", trip: "", to: "client" });
  const trip = trips.rows.find((t) => t.id === sel.trip);
  const client = clients.rows.find((c) => c.id === trip?.client_id);
  const driver = drivers.rows.find((d) => d.id === (trip as unknown as { driver_id: string | null })?.driver_id);
  const rec = sel.to === "client" ? { name: client?.name ?? "", phone: client?.phone ?? "" } : { name: driver?.name ?? "", phone: driver?.phone ?? "" };
  const body = (tpls.rows.find((t) => t.event_kind === sel.event && t.channel === "whatsapp" && t.active)?.body ?? EVENTS[sel.event].body)
    .replace("{nome}", rec.name || "").replace("{origem}", trip?.origin ?? "").replace("{destino}", trip?.destination ?? "").replace("{coleta}", trip?.pickup_date ? trip.pickup_date.split("-").reverse().join("/") : "a combinar");
  const digits = rec.phone.replace(/\D/g, "");
  const waNumber = digits.length >= 10 ? (digits.startsWith("55") ? digits : "55" + digits) : "";

  async function open() {
    await getSupabase()!.from("message_log").insert({ channel: "whatsapp", recipient: rec.name, event_kind: sel.event, body, status: "link_aberto", trip_id: trip?.id ?? null });
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
    logs.reload();
  }

  return (
    <>
      <PageHeader crumb="Gestão" title="Comunicação (WhatsApp)" subtitle="Modelos de mensagem e envio assistido." />
      <Notice tone="warn"><b>A integração automática com a API oficial do WhatsApp Business não está configurada</b>: faltam a conta/número verificado, o token de acesso (guardado só no servidor) e modelos de mensagem aprovados. Enquanto isso, o botão abaixo apenas abre o WhatsApp com o texto preenchido, para você enviar manualmente. O sistema <b>nunca marca “enviado”</b> sem confirmação do provedor. Envie apenas a quem consentiu em receber mensagens.</Notice>
      <Tabs value={tab} onChange={setTab} items={[{ id: "enviar", label: "Enviar" }, { id: "modelos", label: "Modelos" }, { id: "registro", label: "Registro" }]} />
      {tab === "enviar" && (
        <Card><div className="grid gap-4 sm:grid-cols-3">
          <Field label="Evento"><Select value={sel.event} onChange={(e) => setSel({ ...sel, event: e.target.value })}>{Object.entries(EVENTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
          <Field label="Viagem"><Select value={sel.trip} onChange={(e) => setSel({ ...sel, trip: e.target.value })}><option value="">Escolha</option>{trips.rows.map((t) => <option key={t.id} value={t.id}>{t.origin} → {t.destination}</option>)}</Select></Field>
          <Field label="Destinatário"><Select value={sel.to} onChange={(e) => setSel({ ...sel, to: e.target.value })}><option value="client">Cliente</option><option value="driver">Motorista</option></Select></Field>
        </div>
          <p className="mt-4 whitespace-pre-wrap rounded-xl border border-line bg-paper p-4 text-sm">{body}</p>
          <p className="mt-2 text-sm text-muted">Para: {rec.name || "—"} {rec.phone ? `(${rec.phone})` : "— sem telefone cadastrado"}</p>
          <Button className="mt-4" disabled={!staff || !trip || !waNumber} onClick={open}>Abrir no WhatsApp</Button></Card>
      )}
      {tab === "modelos" && (tpls.loading ? <Loading /> : <div className="space-y-4">{Object.entries(EVENTS).map(([k, e]) => <TplEditor key={k} kind={k} label={e.label} def={e.body} tpl={tpls.rows.find((t) => t.event_kind === k && t.channel === "whatsapp")} canEdit={staff} onSaved={tpls.reload} />)}<p className="text-sm text-muted">Variáveis: {"{nome} {origem} {destino} {coleta}"}. Para a API oficial, os modelos precisam ser aprovados pelo provedor.</p></div>)}
      {tab === "registro" && (logs.rows.length === 0 ? <p className="text-muted">Nenhuma tentativa registrada.</p> : <Table head={["Data", "Evento", "Destinatário", "Situação"]}>{logs.rows.map((l) => <tr key={l.id}><Td>{new Date(l.created_at).toLocaleString("pt-BR")}</Td><Td>{EVENTS[l.event_kind ?? ""]?.label ?? l.event_kind}</Td><Td>{l.recipient}</Td><Td><Badge tone={LOGLABEL[l.status].t}>{LOGLABEL[l.status].l}</Badge></Td></tr>)}</Table>)}
    </>
  );
}

function TplEditor({ kind, label, def, tpl, canEdit, onSaved }: { kind: string; label: string; def: string; tpl?: Tpl; canEdit: boolean; onSaved: () => void }) {
  const [b, setB] = useState(tpl?.body ?? def);
  async function save() {
    const { error } = await getSupabase()!.from("message_templates").upsert({ event_kind: kind, channel: "whatsapp", body: b, active: true }, { onConflict: "org_id,event_kind,channel" });
    if (error) alert("Não foi possível salvar."); else onSaved();
  }
  return <Card><Field label={label}><Textarea value={b} maxLength={1500} onChange={(e) => setB(e.target.value)} disabled={!canEdit} /></Field>{canEdit && <Button className="mt-3" variant="ghost" onClick={save}>Salvar modelo</Button>}</Card>;
}
