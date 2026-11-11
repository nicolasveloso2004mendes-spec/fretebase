"use client";
import Link from "next/link";
import { fetchAll } from "@/lib/db";
import { useQuery } from "@/lib/useQuery";
import { today, dateBR } from "@/lib/format";
import { expiryState } from "@/lib/fleet";
import { tripCompliance } from "@/lib/compliance";
import { Notice } from "@/components/extra";
import { Card, ErrorBox, Loading, PageHeader, Stat } from "@/components/ui";

export default function ConformidadePage() {
  const q = useQuery(async () => {
    const [trips, fiscal, ciot, proofs, policies, drivers, vdocs, alerts, vehicles] = await Promise.all([
      fetchAll<{ id: string; origin: string; destination: string; status: string }>("trips", "id, origin, destination, status"),
      fetchAll<{ id: string; kind: string; trip_id: string | null; number: string | null; expires_on: string | null; closed_on: string | null }>("fiscal_documents", "id, kind, trip_id, number, expires_on, closed_on"),
      fetchAll<{ trip_id: string; status: string }>("ciot_records", "trip_id, status"),
      fetchAll<{ trip_id: string }>("delivery_proofs", "trip_id"),
      fetchAll<{ id: string; number: string; valid_to: string | null }>("insurance_policies", "id, number, valid_to"),
      fetchAll<{ id: string; name: string; cnh_expiry: string | null; active: boolean }>("drivers", "id, name, cnh_expiry, active"),
      fetchAll<{ id: string; vehicle_id: string; kind: string; expires_on: string | null }>("vehicle_documents", "id, vehicle_id, kind, expires_on"),
      fetchAll<{ id: string; title: string; priority: string; ref_path: string | null }>("alerts", "id, title, priority, ref_path"),
      fetchAll<{ id: string; name: string; plate: string | null }>("vehicles", "id, name, plate"),
    ]);
    return { trips, fiscal, ciot, proofs, policies, drivers, vdocs, alerts, vehicles };
  });
  if (q.loading) return <Loading />;
  if (q.error || !q.data) return <ErrorBox message={q.error ?? "Erro"} onRetry={q.reload} />;
  const d = q.data, t0 = today();
  const live = d.trips.filter((t) => t.status !== "cancelada");
  const rows = live.map((t) => ({ t, pend: tripCompliance(t, d.fiscal, d.ciot, d.proofs.map((p) => p.trip_id)) }));
  const complete = rows.filter((r) => r.pend.length === 0), pending = rows.filter((r) => r.pend.length > 0);
  const polBad = d.policies.filter((p) => ["vencido", "vencendo"].includes(expiryState(p.valid_to, t0)));
  const drvBad = d.drivers.filter((x) => x.active && ["vencido", "vencendo"].includes(expiryState(x.cnh_expiry, t0)));
  const vehBad = d.vdocs.filter((x) => ["vencido", "vencendo"].includes(expiryState(x.expires_on, t0)));
  const mdfe = d.fiscal.filter((f) => f.kind === "mdfe" && !f.closed_on && d.trips.find((t) => t.id === f.trip_id)?.status === "entregue");
  const docsExp = d.fiscal.filter((f) => expiryState(f.expires_on, t0) === "vencido");
  const crit = d.alerts.filter((a) => a.priority === "critica");

  return (
    <>
      <PageHeader crumb="Fiscal" title="Conformidade operacional" subtitle="Visão das pendências documentais da operação." />
      <Notice tone="warn">Este painel <b>não é certificação de conformidade legal</b>. Ele só mostra o que está (ou não) cadastrado no sistema, com base nas regras configuradas.</Notice>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Viagens com documentação completa" value={String(complete.length)} note={`de ${live.length}`} /><Stat label="Viagens com pendências" value={String(pending.length)} />
        <Stat label="Documentos vencidos" value={String(docsExp.length + vehBad.filter((x) => expiryState(x.expires_on, t0) === "vencido").length)} /><Stat label="Alertas críticos" value={String(crit.length)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><h2 className="font-extrabold text-pine-950">Viagens com pendências</h2>
          {pending.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhuma pendência.</p> : <ul className="mt-3 space-y-3 text-sm">{pending.slice(0, 15).map(({ t, pend }) => <li key={t.id}><Link className="font-semibold underline" href={`/viagens/${t.id}`}>{t.origin} → {t.destination}</Link><p className="text-muted">{pend.join(" · ")}</p></li>)}</ul>}</Card>
        <Card><h2 className="font-extrabold text-pine-950">Manifestos que exigem atenção</h2>
          {mdfe.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhum MDF-e de viagem entregue sem encerramento registrado.</p> : <ul className="mt-3 space-y-2 text-sm">{mdfe.map((m) => <li key={m.id}><Link className="underline" href="/fiscal">MDF-e {m.number}</Link> — viagem entregue, sem data de encerramento.</li>)}</ul>}</Card>
        <Card><h2 className="font-extrabold text-pine-950">Apólices vencidas ou vencendo</h2>
          {polBad.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhuma.</p> : <ul className="mt-3 space-y-2 text-sm">{polBad.map((p) => <li key={p.id}><Link className="underline" href="/seguros">Apólice {p.number}</Link> — até {dateBR(p.valid_to)}</li>)}</ul>}</Card>
        <Card><h2 className="font-extrabold text-pine-950">Motoristas com CNH vencida ou vencendo</h2>
          {drvBad.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhum.</p> : <ul className="mt-3 space-y-2 text-sm">{drvBad.map((p) => <li key={p.id}><Link className="underline" href="/equipe">{p.name}</Link> — CNH até {dateBR(p.cnh_expiry)}</li>)}</ul>}</Card>
        <Card><h2 className="font-extrabold text-pine-950">Veículos com documentos pendentes</h2>
          {vehBad.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhum.</p> : <ul className="mt-3 space-y-2 text-sm">{vehBad.map((x) => { const v = d.vehicles.find((y) => y.id === x.vehicle_id); return <li key={x.id}><Link className="underline" href={`/veiculos/${x.vehicle_id}`}>{v?.name} {v?.plate}</Link> — {x.kind} até {dateBR(x.expires_on)}</li>; })}</ul>}</Card>
        <Card><h2 className="font-extrabold text-pine-950">Alertas críticos abertos</h2>
          {crit.length === 0 ? <p className="mt-2 text-sm text-muted">Nenhum.</p> : <ul className="mt-3 space-y-2 text-sm">{crit.map((a) => <li key={a.id}>{a.ref_path ? <Link className="underline" href={a.ref_path}>{a.title}</Link> : a.title}</li>)}</ul>}</Card>
      </div>
    </>
  );
}
