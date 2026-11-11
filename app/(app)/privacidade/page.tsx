"use client";
import { useState } from "react";
import { useTable } from "@/lib/useTable";
import { getSupabase } from "@/lib/supabase";
import { dateBR } from "@/lib/format";
import { Notice, Table, Tabs, Td } from "@/components/extra";
import { Badge, Button, Card, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";

type R = { id: string; record_type: string; kind: string | null; subject_name: string | null; subject_contact: string | null; description: string | null; status: string; created_at: string; resolved_at: string | null };
const INVENTORY = [
  ["Motoristas", "nome, telefone, categoria e validade da CNH", "execução de contrato de trabalho/serviço; obrigação legal", "enquanto vigorar o vínculo + prazos legais"],
  ["Clientes (contatos)", "nome, telefone, e-mail, condições de pagamento", "execução de contrato; legítimo interesse", "enquanto houver relação comercial + prazos fiscais"],
  ["Usuários do sistema", "e-mail, nome, papel de acesso", "execução de contrato", "enquanto a conta estiver ativa"],
  ["Localização do motorista", "coordenadas durante a viagem, só com consentimento e viagem em andamento", "consentimento (revogável a qualquer momento)", "definir política (sugestão: poucos dias após a entrega)"],
  ["Documentos fiscais e comprovantes", "XML, PDF, fotos e assinaturas de recebimento", "obrigação legal; execução de contrato", "prazos fiscais aplicáveis"],
];

export default function PrivacidadePage() {
  const recs = useTable<R>("privacy_records");
  const [tab, setTab] = useState("inventario");
  const [v, setV] = useState({ record_type: "solicitacao_titular", kind: "acesso", subject_name: "", subject_contact: "", description: "" });
  const [open, setOpen] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await getSupabase()!.from("privacy_records").insert(v);
    if (!error) { setOpen(false); recs.reload(); }
  }
  async function setStatus(r: R, status: string) {
    await getSupabase()!.from("privacy_records").update({ status, resolved_at: status === "concluido" ? new Date().toISOString() : null }).eq("id", r.id); recs.reload();
  }
  return (
    <>
      <PageHeader crumb="Conta" title="Privacidade (LGPD)" subtitle="Inventário de dados, solicitações de titulares e incidentes." />
      <Notice tone="warn">Este módulo ajuda a <b>organizar</b> o tratamento de dados pessoais. Ele não garante conformidade com a LGPD: bases legais, prazos de retenção e textos precisam ser revisados por profissional jurídico. Modelos de documentos estão na pasta <code>docs/</code> do repositório.</Notice>
      <Tabs value={tab} onChange={setTab} items={[{ id: "inventario", label: "Inventário de dados" }, { id: "solicitacoes", label: "Solicitações de titulares" }, { id: "incidentes", label: "Incidentes" }]} />
      {tab === "inventario" && <Table head={["Dado", "O que é tratado", "Base legal (a validar)", "Retenção (a definir)"]}>{INVENTORY.map((r) => <tr key={r[0]}>{r.map((c) => <Td key={c}>{c}</Td>)}</tr>)}</Table>}
      {tab !== "inventario" && (
        <>
          {!open && <Button className="mb-4" onClick={() => { setV({ ...v, record_type: tab === "incidentes" ? "incidente" : "solicitacao_titular", kind: tab === "incidentes" ? "incidente" : "acesso" }); setOpen(true); }}>Novo registro</Button>}
          {open && <Card className="mb-5"><form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo"><Select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>{v.record_type === "incidente" ? <option value="incidente">Incidente de segurança</option> : ["acesso", "correcao", "exclusao", "portabilidade", "revogacao_consentimento"].map((k) => <option key={k} value={k}>{k.replace("_", " ")}</option>)}</Select></Field>
            <Field label="Titular / afetado"><Input value={v.subject_name} onChange={(e) => setV({ ...v, subject_name: e.target.value })} /></Field><Field label="Contato"><Input value={v.subject_contact} onChange={(e) => setV({ ...v, subject_contact: e.target.value })} /></Field>
            <div className="sm:col-span-2"><Field label="Descrição"><Textarea maxLength={3000} value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field></div>
            <div className="flex gap-3 sm:col-span-2"><Button type="submit">Registrar</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button></div></form></Card>}
          {recs.loading ? <Loading /> : <Table head={["Data", "Tipo", "Titular", "Situação", ""]}>{recs.rows.filter((r) => r.record_type === (tab === "incidentes" ? "incidente" : "solicitacao_titular")).map((r) => <tr key={r.id}><Td>{dateBR(r.created_at)}</Td><Td>{r.kind}<p className="text-xs text-muted">{r.description}</p></Td><Td>{r.subject_name}<p className="text-xs text-muted">{r.subject_contact}</p></Td><Td><Badge tone={r.status === "concluido" ? "good" : "warn"}>{r.status}</Badge></Td><Td>{r.status !== "concluido" && <Button variant="ghost" onClick={() => setStatus(r, r.status === "aberto" ? "em_andamento" : "concluido")}>{r.status === "aberto" ? "Iniciar" : "Concluir"}</Button>}</Td></tr>)}</Table>}
        </>
      )}
    </>
  );
}
