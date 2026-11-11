"use client";
import Link from "next/link";
import { useState } from "react";
import { useRole } from "@/lib/session";
import { isStaff } from "@/lib/permissions";
import { useTable } from "@/lib/useTable";
import { dateBR, money, today } from "@/lib/format";
import type { TripFull as Trip, TripStatus } from "@/lib/types";
import { Badge, Button, Empty, ErrorBox, Field, Input, Loading, PageHeader, Select, linkBtnGhost } from "@/components/ui";

const label: Record<TripStatus, string> = { agendada: "Agendada", em_viagem: "Em viagem", entregue: "Entregue", cancelada: "Cancelada" };
const tone: Record<TripStatus, "info" | "warn" | "good" | "bad"> = { agendada: "info", em_viagem: "warn", entregue: "good", cancelada: "bad" };

export default function ViagensPage() {
  const staff = isStaff(useRole());
  const trips = useTable<Trip>("trips", { select: "*, clients(name), vehicles(name, plate), drivers(name)" });
  const [error, setError] = useState<string | null>(null);

  async function patch(id: string, values: Record<string, unknown>) {
    setError(null);
    try {
      await trips.update(id, values);
    } catch (x) {
      setError((x as Error).message || "Não foi possível atualizar a viagem.");
    }
  }

  const pending = trips.rows.filter((t) => t.payment_status === "pendente" && t.status !== "cancelada").reduce((s, t) => s + t.freight_value, 0);
  const received = trips.rows.filter((t) => t.payment_status === "pago").reduce((s, t) => s + t.freight_value, 0);

  return (
    <>
      <PageHeader
        crumb="Viagens e recebimentos"
        title="Viagens e recebimentos"
        subtitle="Acompanhe coletas, entregas e pagamentos de fretes aprovados."
      />
      {error && <div className="mb-4"><ErrorBox message={error} /></div>}

      {trips.loading ? (
        <Loading />
      ) : trips.error ? (
        <ErrorBox message={trips.error} onRetry={trips.reload} />
      ) : trips.rows.length === 0 ? (
        <Empty title="Nenhuma viagem ainda" text="Quando um cliente aprovar uma cotação, a viagem aparece aqui para você acompanhar entrega e pagamento." />
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">A receber</p>
              <p className="tnum mt-2 text-2xl font-extrabold text-pine-950">{money(pending)}</p>
            </div>
            <div className="rounded-2xl border border-line bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">Já recebido</p>
              <p className="tnum mt-2 text-2xl font-extrabold text-pine-950">{money(received)}</p>
            </div>
          </div>
          <ul className="space-y-3">
            {trips.rows.map((t) => (
              <li key={t.id} className="rounded-2xl border border-line bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold text-pine-950">{t.origin} → {t.destination}</p>
                    <p className="mt-1 text-sm text-muted">
                      {t.clients?.name ?? "Sem cliente"}
                      {t.vehicles && ` · ${t.vehicles.name}${t.vehicles.plate ? ` (${t.vehicles.plate})` : ""}`}
                      {` · ${t.drivers?.name ? `Motorista: ${t.drivers.name}` : "Sem motorista"}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tnum font-extrabold text-pine-950">{money(t.freight_value)}</p>
                    <div className="mt-1 flex justify-end gap-1.5">
                      <Badge tone={tone[t.status]}>{label[t.status]}</Badge>
                      <Badge tone={t.payment_status === "pago" ? "good" : "warn"}>{t.payment_status === "pago" ? `Pago em ${dateBR(t.paid_at)}` : "A receber"}</Badge>
                    </div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-4">
                  <Field label="Coleta">
                    <Input type="date" value={t.pickup_date ?? ""} onChange={(e) => patch(t.id, { pickup_date: e.target.value || null })} />
                  </Field>
                  <Field label="Entrega">
                    <Input type="date" value={t.delivery_date ?? ""} onChange={(e) => patch(t.id, { delivery_date: e.target.value || null })} />
                  </Field>
                  <Field label="Situação">
                    <Select disabled={!staff} value={t.status} onChange={(e) => patch(t.id, { status: e.target.value })}>
                      {(Object.keys(label) as TripStatus[]).map((s) => (
                        <option key={s} value={s}>{label[s]}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Vencimento do pagamento">
                    <Input type="date" value={t.payment_due ?? ""} onChange={(e) => patch(t.id, { payment_due: e.target.value || null })} />
                  </Field>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {t.payment_status === "pendente" ? (
                    <Button onClick={() => patch(t.id, { payment_status: "pago", paid_at: today() })}>Marcar como pago</Button>
                  ) : (
                    <Button variant="ghost" onClick={() => patch(t.id, { payment_status: "pendente", paid_at: null })}>Desfazer pagamento</Button>
                  )}
                  <Link href={`/viagens/${t.id}`} className={linkBtnGhost}>Detalhes, motorista e despesas</Link>
                  {staff && (
                    <Button
                      variant="danger"
                      onClick={async () => {
                        if (confirm("Excluir esta viagem?")) await trips.remove(t.id);
                      }}
                    >
                      Excluir
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
