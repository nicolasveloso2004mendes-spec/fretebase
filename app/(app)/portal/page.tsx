"use client";
import { useState } from "react";
import { useAppSession } from "@/lib/session";
import { fetchAll } from "@/lib/db";
import { useQuery } from "@/lib/useQuery";
import { estimateEta, DEFAULT_ETA } from "@/lib/compliance";
import { dateBR, money } from "@/lib/format";
import { FileLink } from "@/components/FileField";
import { Notice } from "@/components/extra";
import { Badge, Button, Card, Empty, ErrorBox, Loading, PageHeader, Stat } from "@/components/ui";

type CT = { id: string; origin: string; destination: string; cargo: string | null; status: string; pickup_date: string | null; delivery_date: string | null; picked_up_at: string | null; started_at: string | null; delivered_at: string | null; distance_km: number | null; freight_value: number; payment_due: string | null; payment_status: string; vehicle_plate: string | null; created_at: string; sharing_location: boolean };
type CE = { id: string; trip_id: string; kind: string; note: string | null; created_at: string };
type CP = { trip_id: string; received_by: string; confirmed_at: string; photo_paths: string[]; signature_path: string | null };
type CD = { id: string; kind: string; number: string | null; issued_on: string | null; trip_id: string | null; file_path: string | null };
type CL = { trip_id: string; lat: number; lng: number; accuracy_m: number | null; recorded_at: string };
const ST: Record<string, { l: string; t: "info" | "good" | "neutral" | "bad" }> = { agendada: { l: "Programada", t: "neutral" }, em_viagem: { l: "Em trânsito", t: "info" }, entregue: { l: "Entregue", t: "good" }, cancelada: { l: "Cancelada", t: "bad" } };
const EV: Record<string, string> = { coleta: "Coleta confirmada", inicio: "Viagem iniciada / em trânsito", atraso: "Atraso informado", entrega: "Entrega confirmada", status: "Atualização", parada: "Parada" };

export default function PortalPage() {
  const { member } = useAppSession();
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"andamento" | "historico">("andamento");
  const q = useQuery(async () => {
    const [trips, events, proofs, docs, locs] = await Promise.all([fetchAll<CT>("client_trips", "*", "created_at"), fetchAll<CE>("client_events", "*", "created_at"), fetchAll<CP>("client_proofs"), fetchAll<CD>("client_documents"), fetchAll<CL>("client_last_location")]);
    return { trips, events, proofs, docs, locs };
  });
  if (q.loading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox message={q.error ?? "Erro"} onRetry={q.reload} />;
  const { trips, events, proofs, docs, locs } = q.data;
  if (!member?.clientId) return <Notice tone="warn">Sua conta ainda não está vinculada a um cliente. Peça à transportadora para refazer o convite.</Notice>;
  const active = trips.filter((t) => t.status === "agendada" || t.status === "em_viagem");
  const done = trips.filter((t) => t.status === "entregue");
  const onTime = done.filter((t) => t.delivery_date && t.delivered_at);
  const list = tab === "andamento" ? active : trips.filter((t) => t.status !== "agendada" && t.status !== "em_viagem");

  return (
    <>
      <PageHeader crumb="Portal do cliente" title="Minhas entregas" subtitle="Acompanhe suas cargas, documentos e comprovantes." />
      <div className="mb-6 grid gap-3 sm:grid-cols-3"><Stat label="Em andamento" value={String(active.length)} /><Stat label="Entregues" value={String(done.length)} />
        <Stat label="Entregas no prazo" value={onTime.length ? `${Math.round((onTime.filter((t) => t.delivered_at!.slice(0, 10) <= t.delivery_date!).length / onTime.length) * 100)}%` : "—"} note={onTime.length ? `de ${onTime.length} com previsão` : "Sem previsão registrada"} /></div>
      <div className="mb-5 flex gap-2" role="tablist">{(["andamento", "historico"] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-11 rounded-xl border px-4 text-sm font-bold ${tab === k ? "border-pine-900 bg-pine-900 text-white" : "border-line bg-white"}`}>{k === "andamento" ? "Em andamento" : "Histórico"}</button>)}</div>
      {list.length === 0 ? <Empty title="Nada por aqui" text={tab === "andamento" ? "Você não tem cargas em andamento." : "Seu histórico aparece aqui."} /> : (
        <ul className="space-y-4">
          {list.map((t) => {
            const ev = events.filter((e) => e.trip_id === t.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
            const proof = proofs.find((p) => p.trip_id === t.id);
            const loc = locs.find((l) => l.trip_id === t.id);
            const eta = t.status === "em_viagem" ? estimateEta({ distanceKm: t.distance_km, startedAt: t.started_at, settings: DEFAULT_ETA }) : null;
            return (
              <li key={t.id}><Card>
                <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-extrabold text-pine-950">{t.origin} → {t.destination}</h2><Badge tone={ST[t.status].t}>{ST[t.status].l}</Badge></div>
                <p className="mt-1 text-sm text-muted">{t.cargo ?? "Carga"} · coleta {dateBR(t.pickup_date)} · previsão de entrega {t.delivery_date ? dateBR(t.delivery_date) : eta ? `${eta.eta.toLocaleString("pt-BR")} (estimativa)` : "indisponível"}</p>
                <Button variant="ghost" className="mt-3" onClick={() => setOpen(open === t.id ? null : t.id)}>{open === t.id ? "Ocultar detalhes" : "Ver linha do tempo e documentos"}</Button>
                {open === t.id && (
                  <div className="mt-4 grid gap-5 lg:grid-cols-2">
                    <div><h3 className="font-bold">Linha do tempo</h3>
                      <ol className="mt-2 space-y-2 border-l-2 border-line pl-4 text-sm">
                        <li><b>Viagem registrada</b><span className="block text-xs text-muted">{new Date(t.created_at).toLocaleString("pt-BR")}</span></li>
                        {ev.filter((e) => e.note !== "Viagem criada").map((e) => <li key={e.id}><b>{EV[e.kind] ?? e.kind}</b>{e.kind === "atraso" && e.note ? `: ${e.note}` : ""}<span className="block text-xs text-muted">{new Date(e.created_at).toLocaleString("pt-BR")}</span></li>)}
                        {proof && <li><b>Comprovante disponível</b><span className="block text-xs text-muted">{new Date(proof.confirmed_at).toLocaleString("pt-BR")} · recebido por {proof.received_by}</span></li>}
                      </ol>
                      {t.status === "em_viagem" && (loc && t.sharing_location ? <p className="mt-3 text-sm">Última posição compartilhada pelo motorista: <a className="font-semibold text-pine-700 underline" target="_blank" rel="noopener noreferrer" href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=14/${loc.lat}/${loc.lng}`}>ver no mapa</a> ({new Date(loc.recorded_at).toLocaleTimeString("pt-BR")}). Atualiza só com o aplicativo aberto no celular do motorista.</p> : <p className="mt-3 text-sm text-muted">Localização em tempo real indisponível. O acompanhamento é feito pelos eventos acima.</p>)}
                    </div>
                    <div><h3 className="font-bold">Documentos e comprovantes</h3>
                      <ul className="mt-2 space-y-2 text-sm">
                        {proof?.photo_paths.map((p, i) => <li key={p}><FileLink path={p}>Foto do comprovante {i + 1}</FileLink></li>)}
                        {proof?.signature_path && <li><FileLink path={proof.signature_path}>Assinatura do recebedor</FileLink></li>}
                        {docs.filter((d) => d.trip_id === t.id).map((d) => <li key={d.id}>{d.kind.toUpperCase()} {d.number} {d.file_path ? <FileLink path={d.file_path}>Abrir</FileLink> : null}</li>)}
                        {!proof && !docs.some((d) => d.trip_id === t.id) && <li className="text-muted">Nenhum documento liberado ainda.</li>}
                      </ul>
                      <p className="mt-3 text-sm">Frete: <b>{money(t.freight_value)}</b> · pagamento {t.payment_status === "pago" ? "confirmado" : "pendente"}{t.payment_due ? ` (vencimento ${dateBR(t.payment_due)})` : ""}</p>
                    </div>
                  </div>
                )}
              </Card></li>
            );
          })}
        </ul>
      )}
    </>
  );
}
