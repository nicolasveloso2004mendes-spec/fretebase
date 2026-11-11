"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useTable } from "@/lib/useTable";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { isStaff, isAdmin } from "@/lib/permissions";
import { parseFiscalXml, suggestTrips, type FiscalXml } from "@/lib/xml";
import { dateBR, money, today, toNumber } from "@/lib/format";
import { uploadFile } from "@/lib/storage";
import { logEvent } from "@/lib/db";
import { useQuery } from "@/lib/useQuery";
import { FileField, FileLink } from "@/components/FileField";
import { Notice, Table, Tabs, Td } from "@/components/extra";
import { Badge, Button, Card, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, Textarea } from "@/components/ui";
import type { Client, Trip } from "@/lib/types";

type Doc = {
  id: string; kind: string; number: string | null; series: string | null; access_key: string | null; issued_on: string | null; expires_on: string | null; closed_on: string | null;
  issuer_name: string | null; recipient_name: string | null; client_id: string | null; trip_id: string | null; origin: string | null; destination: string | null;
  service_value: number | null; status: string; fiscal_status: string; source: string; xml_valid: boolean | null; file_path: string | null; released_to_client: boolean; notes: string | null;
  tax_info: Record<string, string>; created_at: string;
};
export const KIND: Record<string, string> = { cte: "CT-e", mdfe: "MDF-e", nfe: "NF-e", ciot: "CIOT", comprovante: "Comprovante de entrega", apolice: "Apólice/certificado", outro: "Outro" };
const FISCAL: Record<string, { l: string; t: "neutral" | "good" | "bad" }> = { nao_verificada: { l: "Situação fiscal não verificada", t: "neutral" }, autorizado: { l: "Autorizado (consulta oficial)", t: "good" }, cancelado: { l: "Cancelado (consulta oficial)", t: "bad" } };
const STATUS: Record<string, string> = { pendente: "Pendente", cadastrado: "Cadastrado", encerrado_interno: "Encerrado (registro interno)", arquivado: "Arquivado" };
type Hist = { id: number; action: string; changes: Record<string, unknown> | null; created_at: string };

export default function FiscalPage() {
  const { member } = useAppSession();
  const staff = isStaff(member?.role ?? null);
  const docs = useTable<Doc>("fiscal_documents");
  const clients = useTable<Client>("clients", { order: "name" });
  const trips = useTable<Trip>("trips");
  const [tab, setTab] = useState("todos");
  const [f, setF] = useState({ client: "", trip: "", from: "", to: "", status: "" });
  const [mode, setMode] = useState<null | "xml" | "manual">(null);
  const [edit, setEdit] = useState<Doc | null>(null);

  const rows = useMemo(
    () => docs.rows.filter((d) => (tab === "todos" || d.kind === tab) && (!f.client || d.client_id === f.client) && (!f.trip || d.trip_id === f.trip) &&
      (!f.status || d.status === f.status) && (!f.from || (d.issued_on ?? "") >= f.from) && (!f.to || (d.issued_on ?? "9") <= f.to)),
    [docs.rows, tab, f],
  );
  const loading = docs.loading || clients.loading || trips.loading;
  const clientName = (id: string | null) => clients.rows.find((c) => c.id === id)?.name ?? "—";
  const tripLabel = (id: string | null) => { const t = trips.rows.find((x) => x.id === id); return t ? `${t.origin} → ${t.destination}` : "—"; };

  return (
    <>
      <PageHeader crumb="Fiscal" title="Central Fiscal" subtitle="CT-e, MDF-e, NF-e, CIOT, comprovantes e apólices das operações."
        action={staff && !mode && <div className="flex gap-2"><Button onClick={() => setMode("xml")}>Importar XML</Button><Button variant="ghost" onClick={() => setMode("manual")}>Cadastrar manualmente</Button></div>} />
      <Notice>Documentos cadastrados ou importados aqui <b>não são emitidos nem autorizados por este sistema</b>. A situação fiscal só aparece como “autorizado” ou “cancelado” quando houver consulta oficial integrada. Sem ela, o documento fica como “situação fiscal não verificada”, mesmo que o XML traga um protocolo.</Notice>

      {mode === "xml" && staff && <ImportXml orgId={member!.orgId} trips={trips.rows} clients={clients.rows} existing={docs.rows} onDone={() => { setMode(null); docs.reload(); }} />}
      {mode === "manual" && staff && <DocForm orgId={member!.orgId} clients={clients.rows} trips={trips.rows} onDone={() => { setMode(null); docs.reload(); }} onCancel={() => setMode(null)} />}
      {edit && staff && <DocForm key={edit.id} orgId={member!.orgId} doc={edit} clients={clients.rows} trips={trips.rows} onDone={() => { setEdit(null); docs.reload(); }} onCancel={() => setEdit(null)} />}

      <Tabs value={tab} onChange={setTab} items={[{ id: "todos", label: "Todos" }, ...["cte", "mdfe", "nfe", "ciot", "comprovante", "apolice", "outro"].map((k) => ({ id: k, label: KIND[k] }))]} />
      <Card className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Cliente"><Select value={f.client} onChange={(e) => setF({ ...f, client: e.target.value })}><option value="">Todos</option>{clients.rows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          <Field label="Viagem"><Select value={f.trip} onChange={(e) => setF({ ...f, trip: e.target.value })}><option value="">Todas</option>{trips.rows.map((t) => <option key={t.id} value={t.id}>{t.origin} → {t.destination}</option>)}</Select></Field>
          <Field label="Emitido de"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
          <Field label="Até"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          <Field label="Situação"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="">Todas</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
        </div>
      </Card>

      {loading ? <Loading /> : docs.error ? <ErrorBox message={docs.error} onRetry={docs.reload} /> : rows.length === 0 ? (
        <Empty title="Nenhum documento" text="Importe um XML ou cadastre um documento para começar." />
      ) : (
        <Table head={["Tipo", "Número", "Emissão", "Cliente / viagem", "Valor", "Situação", "Arquivo", ""]}>
          {rows.map((d) => (
            <tr key={d.id}>
              <Td><b>{KIND[d.kind]}</b>{d.source === "xml_importado" && <p className="text-xs text-muted">XML importado{d.xml_valid ? " · estrutura válida" : ""}</p>}</Td>
              <Td>{d.number ?? "—"}{d.series ? `/${d.series}` : ""}{d.access_key && <p className="max-w-[12rem] break-all text-[11px] text-muted">{d.access_key}</p>}</Td>
              <Td>{dateBR(d.issued_on)}{d.expires_on && <p className="text-xs text-muted">vence {dateBR(d.expires_on)}</p>}</Td>
              <Td>{clientName(d.client_id)}<p className="text-xs text-muted">{d.trip_id ? <Link className="underline" href={`/viagens/${d.trip_id}`}>{tripLabel(d.trip_id)}</Link> : "Sem viagem"}</p></Td>
              <Td className="tnum">{d.service_value != null ? money(d.service_value) : "—"}</Td>
              <Td><Badge tone={FISCAL[d.fiscal_status].t}>{FISCAL[d.fiscal_status].l}</Badge><p className="mt-1 text-xs text-muted">{STATUS[d.status]}</p></Td>
              <Td><FileLink path={d.file_path} /></Td>
              <Td>{staff && <Button variant="ghost" onClick={() => { setEdit(d); window.scrollTo({ top: 0 }); }}>Abrir</Button>}</Td>
            </tr>
          ))}
        </Table>
      )}
      {!staff && <p className="mt-4 text-sm text-muted">Seu perfil consulta os documentos; o cadastro é da gestão.</p>}
      {isAdmin(member?.role ?? null) && <p className="mt-4 text-xs text-muted">Todas as alterações ficam no histórico de cada documento.</p>}
    </>
  );
}

function ImportXml({ orgId, trips, clients, existing, onDone }: { orgId: string; trips: Trip[]; clients: Client[]; existing: Doc[]; onDone: () => void }) {
  const [res, setRes] = useState<{ doc: FiscalXml; raw: File } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tripId, setTripId] = useState("");
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    setErr(null); setRes(null);
    if (!file) return;
    if (!/\.xml$/i.test(file.name) && !file.type.includes("xml")) return setErr("Envie um arquivo .xml.");
    const r = parseFiscalXml(await file.text());
    if (!r.ok) return setErr(r.error);
    setRes({ doc: r.doc, raw: file });
    setTripId(suggestTrips(r.doc, trips)[0]?.id ?? "");
    const rec = r.doc.recipientDoc;
    setClientId(rec ? (clients.find((c) => (c.notes ?? "").includes(rec))?.id ?? "") : "");
  }
  const dup = res?.doc.accessKey ? existing.find((d) => d.access_key === res.doc.accessKey) : undefined;
  const sugg = res ? suggestTrips(res.doc, trips) : [];

  async function save() {
    if (!res || dup) return;
    setBusy(true); setErr(null);
    try {
      const d = res.doc;
      const path = await uploadFile(orgId, "fiscal", new Blob([await res.raw.text()], { type: "text/xml" }) as Blob & { type: string; size: number }, true);
      const { error } = await getSupabase()!.from("fiscal_documents").insert({
        kind: d.kind, number: d.number, series: d.series, access_key: d.accessKey, issued_on: d.issuedOn, issuer_name: d.issuerName, issuer_doc: d.issuerDoc,
        recipient_name: d.recipientName, recipient_doc: d.recipientDoc, client_id: clientId || null, trip_id: tripId || null, origin: d.origin, destination: d.destination,
        service_value: d.serviceValue, cargo_value: d.cargoValue, tax_info: d.taxInfo, source: "xml_importado", xml_valid: true, file_path: path,
        notes: d.protocol.present ? `O XML traz protocolo (cStat ${d.protocol.cStat ?? "?"}). Isto não foi confirmado em consulta oficial.` : null,
      });
      if (error) throw new Error(error.message.includes("fiscal_documents_key_uidx") ? "Este documento (mesma chave de acesso) já está cadastrado." : "Não foi possível gravar o documento.");
      onDone();
    } catch (x) { setErr((x as Error).message); }
    setBusy(false);
  }

  return (
    <Card className="mb-6">
      <h2 className="text-lg font-extrabold text-pine-950">Importar XML</h2>
      <p className="mt-1 text-sm text-muted">Aceita CT-e, NF-e e MDF-e (até 2 MB). Nada é gravado antes da sua confirmação.</p>
      <label className="mt-4 inline-flex min-h-11 cursor-pointer items-center rounded-xl border border-line bg-white px-4 font-bold hover:bg-paper">
        Escolher arquivo XML<input type="file" accept=".xml,text/xml,application/xml" className="sr-only" onChange={pick} />
      </label>
      {err && <p role="alert" className="mt-3 text-sm font-semibold text-danger">{err}</p>}
      {res && (
        <div className="mt-5 space-y-4">
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            {([["Tipo", KIND[res.doc.kind]], ["Número / série", `${res.doc.number ?? "—"} / ${res.doc.series ?? "—"}`], ["Emissão", dateBR(res.doc.issuedOn)], ["Emitente", `${res.doc.issuerName ?? "—"} (${res.doc.issuerDoc ?? "—"})`],
              ["Destinatário/tomador", `${res.doc.recipientName ?? "—"} (${res.doc.recipientDoc ?? "—"})`], ["Rota", `${res.doc.origin ?? "—"} → ${res.doc.destination ?? "—"}`],
              ["Valor do serviço", res.doc.serviceValue != null ? money(res.doc.serviceValue) : "—"], ["Valor da carga", res.doc.cargoValue != null ? money(res.doc.cargoValue) : "—"], ["Chave de acesso", res.doc.accessKey ?? "não encontrada"]] as const).map(([k, v]) => (
              <div key={k}><dt className="text-xs font-semibold uppercase text-muted">{k}</dt><dd className="break-all font-semibold">{v}</dd></div>
            ))}
          </dl>
          <Notice tone="warn">XML estruturalmente válido e importado. <b>Situação fiscal: não verificada</b> — a importação não comprova autorização na SEFAZ.</Notice>
          {dup && <Notice tone="bad">Documento duplicado: já cadastrado (número {dup.number}). A gravação foi bloqueada.</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vincular à viagem" hint={sugg.length ? `${sugg.length} sugestão(ões) pela rota e data.` : "Nenhuma viagem parecida encontrada."}>
              <Select value={tripId} onChange={(e) => setTripId(e.target.value)}><option value="">Sem viagem</option>
                {[...sugg, ...trips.filter((t) => !sugg.includes(t))].map((t) => <option key={t.id} value={t.id}>{sugg.includes(t) ? "★ " : ""}{t.origin} → {t.destination}</option>)}</Select>
            </Field>
            <Field label="Cliente / tomador"><Select value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Sem cliente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
          </div>
          <div className="flex gap-3"><Button disabled={busy || !!dup} onClick={save}>{busy ? "Gravando…" : "Confirmar e gravar"}</Button><Button variant="ghost" onClick={() => setRes(null)}>Descartar</Button></div>
        </div>
      )}
      <div className="mt-4"><Button variant="ghost" onClick={onDone}>Fechar</Button></div>
    </Card>
  );
}

function DocForm({ orgId, doc, clients, trips, onDone, onCancel }: { orgId: string; doc?: Doc; clients: Client[]; trips: Trip[]; onDone: () => void; onCancel: () => void }) {
  const { member } = useAppSession();
  const [v, setV] = useState({
    kind: doc?.kind ?? "cte", number: doc?.number ?? "", series: doc?.series ?? "", access_key: doc?.access_key ?? "", issued_on: doc?.issued_on ?? today(), expires_on: doc?.expires_on ?? "",
    client_id: doc?.client_id ?? "", trip_id: doc?.trip_id ?? "", service_value: doc?.service_value != null ? String(doc.service_value) : "", status: doc?.status ?? "cadastrado", notes: doc?.notes ?? "",
    closed_on: doc?.closed_on ?? "", released: doc?.released_to_client ?? false,
  });
  const [file, setFile] = useState<string | null>(doc?.file_path ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hist = useQuery<Hist[]>(async () => {
    if (!doc || !isAdmin(member?.role ?? null)) return [];
    const { data } = await getSupabase()!.from("audit_log").select("id, action, changes, created_at").eq("table_name", "fiscal_documents").eq("record_id", doc.id).order("created_at", { ascending: false }).limit(20);
    return (data ?? []) as Hist[];
  }, [doc?.id]);
  const s = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const key = v.access_key.replace(/\D/g, "");
    if (v.access_key && key.length !== 44) return setErr("A chave de acesso tem 44 dígitos.");
    setBusy(true);
    const row = {
      kind: v.kind, number: v.number.trim() || null, series: v.series.trim() || null, access_key: key || null, issued_on: v.issued_on || null, expires_on: v.expires_on || null,
      closed_on: v.closed_on || null, client_id: v.client_id || null, trip_id: v.trip_id || null, service_value: v.service_value ? toNumber(v.service_value) : null,
      status: v.status, notes: v.notes.trim() || null, file_path: file, released_to_client: v.released,
    };
    const sb = getSupabase()!;
    const { error } = doc ? await sb.from("fiscal_documents").update(row).eq("id", doc.id) : await sb.from("fiscal_documents").insert(row);
    setBusy(false);
    if (error) return setErr(error.message.includes("key_uidx") ? "Já existe documento com esta chave de acesso." : "Não foi possível salvar.");
    onDone();
  }
  return (
    <Card className="mb-6">
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-lg font-extrabold text-pine-950 sm:col-span-2">{doc ? `${KIND[doc.kind]} ${doc.number ?? ""}` : "Novo documento"}</h2>
        <Field label="Tipo"><Select value={v.kind} onChange={s("kind")} disabled={!!doc}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        <Field label="Número"><Input value={v.number} maxLength={30} onChange={s("number")} /></Field>
        <Field label="Série"><Input value={v.series} maxLength={5} onChange={s("series")} /></Field>
        <Field label="Chave de acesso (44 dígitos)"><Input inputMode="numeric" value={v.access_key} onChange={s("access_key")} /></Field>
        <Field label="Data de emissão"><Input type="date" value={v.issued_on} onChange={s("issued_on")} /></Field>
        <Field label="Vencimento (quando houver)"><Input type="date" value={v.expires_on} onChange={s("expires_on")} /></Field>
        <Field label="Cliente / tomador"><Select value={v.client_id} onChange={s("client_id")}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Viagem"><Select value={v.trip_id} onChange={s("trip_id")}><option value="">—</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.origin} → {t.destination}</option>)}</Select></Field>
        <Field label="Valor do serviço (R$)"><Input inputMode="decimal" value={v.service_value} onChange={s("service_value")} /></Field>
        <Field label="Situação no sistema"><Select value={v.status} onChange={s("status")}>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></Field>
        {v.kind === "mdfe" && <Field label="Data de encerramento (registro interno)" hint="Registre aqui o encerramento feito no emissor oficial. Este sistema não encerra manifestos na SEFAZ."><Input type="date" value={v.closed_on} onChange={s("closed_on")} /></Field>}
        <div className="sm:col-span-2"><FileField label="Arquivo (XML, PDF ou foto)" orgId={orgId} folder="fiscal" value={file} onChange={setFile} allowXml /></div>
        <label className="flex min-h-11 items-center gap-3 text-sm font-semibold sm:col-span-2"><input type="checkbox" className="size-5" checked={v.released} onChange={(e) => setV({ ...v, released: e.target.checked })} />Liberar para o cliente ver no portal</label>
        <div className="sm:col-span-2"><Field label="Observações"><Textarea value={v.notes} maxLength={2000} onChange={s("notes")} /></Field></div>
        {err && <p role="alert" className="text-sm font-semibold text-danger sm:col-span-2">{err}</p>}
        <div className="flex gap-3 sm:col-span-2"><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button><Button variant="ghost" onClick={onCancel}>Fechar</Button></div>
      </form>
      {doc && hist.data && hist.data.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="font-extrabold text-pine-950">Histórico de alterações</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {hist.data.map((h) => (
              <li key={h.id}><b>{new Date(h.created_at).toLocaleString("pt-BR")}</b> — {h.action === "insert" ? "cadastrado" : h.action === "delete" ? "excluído" : "alterado"}
                {h.action === "update" && h.changes && <span className="text-muted">: {Object.keys(h.changes).filter((k) => k !== "tax_info").join(", ")}</span>}</li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
