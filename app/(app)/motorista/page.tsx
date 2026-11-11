"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { dateBR } from "@/lib/format";
import type { DriverTrip } from "@/lib/types";
import { Badge, Empty, ErrorBox, Loading, PageHeader } from "@/components/ui";

const label = { agendada: "Agendada", em_viagem: "Em viagem", entregue: "Entregue", cancelada: "Cancelada" } as const;

export default function MotoristaHome() {
  const [rows, setRows] = useState<DriverTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await getSupabase()!.from("driver_trips").select("*").order("created_at", { ascending: false });
    if (error) setError("Não foi possível carregar suas viagens.");
    else setRows((data ?? []) as DriverTrip[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} onRetry={load} />;
  const active = rows.filter((r) => r.status === "agendada" || r.status === "em_viagem");
  const past = rows.filter((r) => !active.includes(r));
  const card = (t: DriverTrip) => (
    <li key={t.id}>
      <Link href={`/motorista/viagem/${t.id}`} className="block rounded-2xl border border-line bg-white p-5 hover:border-pine-700">
        <div className="flex items-start justify-between gap-2">
          <p className="text-lg font-bold text-pine-950">{t.origin} → {t.destination}</p>
          <Badge tone={t.status === "em_viagem" ? "warn" : t.status === "entregue" ? "good" : t.status === "cancelada" ? "bad" : "info"}>{label[t.status]}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted">{t.cargo ?? "Carga não informada"} · Coleta {dateBR(t.pickup_date)} · Entrega {dateBR(t.delivery_date)}</p>
        <p className="text-sm text-muted">{t.vehicle_name ? `${t.vehicle_name} ${t.vehicle_plate ?? ""}` : "Sem veículo definido"}</p>
      </Link>
    </li>
  );
  return (
    <>
      <PageHeader crumb="Motorista" title="Minhas viagens" subtitle="Abra a viagem para fazer o checklist, confirmar a coleta, lançar gastos e registrar a entrega." />
      {active.length === 0 ? <Empty title="Nenhuma viagem atribuída" text="Quando a transportadora atribuir uma viagem a você, ela aparece aqui." /> : <ul className="space-y-3">{active.map(card)}</ul>}
      {past.length > 0 && (<><h2 className="mb-3 mt-8 text-lg font-extrabold text-pine-950">Anteriores</h2><ul className="space-y-3">{past.map(card)}</ul></>)}
    </>
  );
}
