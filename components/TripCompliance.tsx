"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useAppSession } from "@/lib/session";
import { isReader } from "@/lib/permissions";
import { money } from "@/lib/format";
import { DEFAULT_ETA, estimateEta, tollSummary, type EtaSettings, type Toll } from "@/lib/compliance";
import { Badge, Card } from "@/components/ui";

type Doc = { id: string; kind: string; number: string | null; fiscal_status: string };
type Ciot = { id: string; status: string; code: string | null };

/** Resumo fiscal/operacional da viagem. Documentos importados nunca aparecem como "autorizados" aqui. */
export function TripCompliance({ tripId, quoteId, startedAt, delivered }: { tripId: string; quoteId: string | null; startedAt: string | null; delivered: boolean }) {
  const { member, org } = useAppSession();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [ciot, setCiot] = useState<Ciot[]>([]);
  const [tolls, setTolls] = useState<Toll[]>([]);
  const [dist, setDist] = useState<number | null>(null);

  useEffect(() => {
    if (!isReader(member?.role ?? null)) return;
    const sb = getSupabase()!;
    Promise.all([
      sb.from("fiscal_documents").select("id, kind, number, fiscal_status").eq("trip_id", tripId),
      sb.from("ciot_records").select("id, status, code").eq("trip_id", tripId),
      sb.from("toll_records").select("total_value, kind, paid_by").eq("trip_id", tripId),
      quoteId ? sb.from("quotes").select("distance_km").eq("id", quoteId).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([d, c, t, q]) => {
      setDocs((d.data ?? []) as Doc[]); setCiot((c.data ?? []) as Ciot[]); setTolls((t.data ?? []) as Toll[]);
      setDist((q.data as { distance_km: number } | null)?.distance_km ?? null);
    });
  }, [tripId, quoteId, member?.role]);

  if (!isReader(member?.role ?? null)) return null;
  const eta = !delivered && startedAt ? estimateEta({ distanceKm: dist, startedAt, settings: ((org?.settings as { eta?: Partial<EtaSettings> } | undefined)?.eta) ?? DEFAULT_ETA }) : null;
  const ts = tollSummary(tolls);

  return (
    <Card className="mb-6">
      <h2 className="text-lg font-extrabold text-pine-950">Fiscal, CIOT, pedágio e previsão</h2>
      <dl className="mt-3 grid gap-4 text-sm sm:grid-cols-2">
        <div><dt className="font-bold">Documentos fiscais</dt><dd className="mt-1">{docs.length === 0 ? <span className="text-muted">Nenhum vinculado.</span> : docs.map((d) => <p key={d.id}>{d.kind.toUpperCase()} {d.number ?? ""} <Badge tone={d.fiscal_status === "autorizada" ? "good" : "warn"}>{d.fiscal_status === "nao_verificada" ? "não verificada" : d.fiscal_status}</Badge></p>)}<Link href="/fiscal" className="mt-1 inline-block text-pine-700 underline">Central fiscal</Link></dd></div>
        <div><dt className="font-bold">CIOT</dt><dd className="mt-1">{ciot.length === 0 ? <span className="text-muted">Nenhum registro.</span> : ciot.map((c) => <p key={c.id}>{c.code ?? "sem código"} · {c.status}</p>)}<Link href="/ciot" className="mt-1 inline-block text-pine-700 underline">Ver CIOT</Link></dd></div>
        <div><dt className="font-bold">Pedágios</dt><dd className="mt-1">{tolls.length === 0 ? <span className="text-muted">Nenhum registro.</span> : <>Custo confirmado da transportadora: <b>{money(ts.borne)}</b>{ts.estimated > 0 && <> · estimado {money(ts.estimated)}</>}{ts.valePedagio > 0 && <> · vale-pedágio do contratante {money(ts.valePedagio)} (não entra no custo)</>}</>}<br /><Link href="/pedagios" className="text-pine-700 underline">Ver pedágios</Link></dd></div>
        <div><dt className="font-bold">Previsão de chegada</dt><dd className="mt-1">{eta ? <>{eta.eta.toLocaleString("pt-BR")} <span className="text-xs text-muted">(estimativa com {Math.round(eta.driveH)} h de direção, pausas e descanso configuráveis; não é garantia)</span></> : <span className="text-muted">{delivered ? "Viagem entregue." : "Disponível quando a viagem iniciar e houver distância na cotação."}</span>}</dd></div>
      </dl>
    </Card>
  );
}
